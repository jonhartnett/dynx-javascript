import {init as initTransform} from "./dynx-transform";

/**
 * Denotes an invalid Dynx variable. This might either not-yet-initialized or not-currently-valid.
 * @type {Symbol}
 */
export const INVALID = Symbol('invalid');
const NO_ARG = Symbol('NoArg');

/**
 * An expression function for a Dynx.
 * @typedef {Function} Expression
 * @returns {*} The new value.
 */

/**
 * A filter function for a Dynx.
 * @typedef {Function} Filter
 * @param {*} value - The value to be filtered.
 * @returns {*} The filtered value.
 */

/**
 * A listener function for a Dynx.
 * @callback Listener
 */

/**
 * Dynamix core class. Dynamix is a library that allows variables to remember their definitions and automatically update
 * as required. The system is event based under the hood, but subscription is handled entirely under-the-hood, meaning
 * it is easy to use, but also extremely efficient.
 * @author Jonathan Hartnett
 * @class
 */
class Dynx {
    /**
     * Executes a block without subscribing to any triggered Dynxes.
     * @param {Function} func - The function to be called.
     * @param {[]} args - The arguments to call with.
     * @returns {*} The return of the function.
     */
    static immune(func, ...args){
        Dynx._childStack.push(undefined);
        let result = func(...args);
        Dynx._childStack.pop();
        return result;
    }

    /**
     * Creates a new Dynx with an optional initial value.
     * @constructor
     * @param {*} [initial=undefined] - The initial constant value.
     */
    constructor(initial=undefined) {
        this.value = initial;
    }

    /**
     * Returns true if 'value' is finalized.
     * @returns {boolean} True if constant.
     */
    get isConstant(){
        return this.isFinal && !this.exp;
    }

    /**
     * Returns true if 'exp' is finalized.
     * @returns {boolean} True if final.
     */
    get isFinal(){
        return this._isFinal;
    }

    /**
     * Returns true if this Dynx is currently invalid.
     * @returns {boolean} True if invalid.
     */
    get isInvalid(){
        return this.value === INVALID;
    }

    /**
     * Gets the current value.
     * @returns {*} The current value.
     */
    get value() {
        //if currently evaluating an expression, add a subscription
        if(Dynx._childStack.length > 0 && !this.isConstant){
            let top = Dynx._childStack.top;
            if(top !== undefined && top !== this){
                if(top.isFinal)
                    top._pendingConstant = false;
                this.on('update', top.updateHandle);
            }
        }
        //return value
        return this._value;
    }

    /**
     * Sets the current value.
     * @param {*} value - The new constant value.
     */
    set value(value) {
        if(this.isFinal)
            throw new Error('[Dynx] Cannot change the value of a finalized Dynx.');
        //make exp undefined to mark as constant
        delete this._exp;
        if(this._init_value !== value){
            //set value and update
            this._init_value = value;
            this.update(true);
        }
    }

    /**
     * Alias for @see value.
     */
    get x(){
        return this.value;
    }

    /**
     * Alias for @see value.
     */
    set x(value){
        this.value = value;
    }

    /**
     * Gets the current source value. This is the value before filters are applied.
     * @return {*} The current source value.
     */
    get srcValue(){
        return this._init_value;
    }

    /**
     * Sets the current source value. This is the value before filters are applied.
     * @param {*} value - The new source value.
     */
    set srcValue(value){
        this.value = value;
    }

    /**
     * Gets the current expression.
     * @returns {Expression} The expression, or undefined if a constant.
     */
    get exp() {
        return this._exp;
    }

    /**
     * Sets the current expression.
     * @param {Expression} value - The new expression.
     */
    set exp(value) {
        if(this.isFinal)
            throw new Error('[Dynx] Cannot change the value of a finalized Dynx.');
        //set expression and update
        if(typeof value !== 'function')
            throw new Error(`[Dynx] Exp must be a function, not ${value}.`);
        delete this._init_value;
        if(this._exp !== value){
            //set expression and update
            this._exp = value;
            this.update();
        }
    }

    /**
     * Updates the value of this Dynx based on the expression.
     * @param {boolean} [force=true] - True if update listeners should be called regardless of value change.
     */
    update(force=false) {
        //call preUpdate listeners
        this._triggerEvent('pre-update', this._value);

        //create var for new values
        let newValue = this._init_value;

        //if final, create variable to detect non-constant parents
        if(this._isFinal && this.exp)
            this._pendingConstant = true;

        //only evaluate if something might have changed
        if(this._exp || this.filters){
            //createElement new handle
            this._refreshHandle();
            //set child so we catch parents from evaluation and filtering
            Dynx._childStack.push(this);

            //evaluate expression
            if(this._exp)
                newValue = this._exp();
            //filter value
            if(this.filters)
                for(let filter of this.filters)
                    newValue = this::filter(newValue);

            Dynx._childStack.pop();
        }

        //if changed, update _value and call listeners
        if(newValue !== this._value || force){
            //set value to new
            this._value = newValue;
            //update all listeners
            this._triggerEvent('update', this._value);
        }

        if(this._isFinal && this.exp){
            if(this._pendingConstant){
                this._init_value = this._value;
                this.constant();
            }
            delete this._pendingConstant;
        }

        //call postUpdate listeners
        this._triggerEvent('post-update', this._value);
    }

    /**
     * Calls this Dynx's listeners.
     * @param {string} event - The type of listener.
     * @param {*[]} [args] - The arguments to call it with.
     * @private
     */
    _triggerEvent(event, ...args){
        let arrName = Dynx._getEventArrName(event);
        if(event === 'update'){
            //this method would be a simple loop with recursion,
            //  but listeners from sub-dynxes are called in a cue
            //  to avoid stack overflows
            let isMaster = !('_queue' in Dynx);
            if(isMaster)
                Dynx._queue = [];
            //queue listeners for update
            let arr = this[arrName];
            if(arr){
                arr = arr.filter(listener => listener.dynxListener !== null);
                if(arr.length != 0){
                    for(let lis of arr){
                        if(lis.dynxListener)
                            Dynx._queue.push(() => this::lis(...args));
                        else
                            this::lis(...args);
                    }
                    this[arrName] = arr;
                }else{
                    delete this[arrName];
                }
            }
            //if master manager hasn't been start, start one
            if(isMaster){
                let listener;
                while(listener = Dynx._queue.shift())
                    listener();
                delete Dynx._queue;
            }
        }else{
            let arr = this[arrName];
            if(arr){
                for(let lis of arr)
                    this::lis(...args);
            }
        }
    }

    /**
     * Refreshes this Dynx's update handle, which effectively discards all old parents.
     */
    _refreshHandle(){
        //delete old handle
        if(this.updateHandle)
            this.updateHandle.dynxListener = null;
        //create new one
        this.updateHandle = () => this.update();
        this.updateHandle.dynxListener = true;
    }

    /**
     * Adds a listener.
     * @private
     * @param {string} arrName - The event collection to add to.
     * @param {Function} func - The function to add.
     * @param {boolean} immediate - True make an initial call to the handler.
     * @param {number} [priority=0] - The priority of the function.
     */
    _addListener(arrName, func, immediate=false, priority=0){
        if(this.isConstant){
            if(immediate)
                this::func(this._value);
            else
                console.error('[Dynx] Subscription to a finalized Dynx is unnecessary!');
        }else{
            func.priority = priority;
            let arr;
            if(arrName in this){
                arr = this[arrName];
            }else{
                arr = this[arrName] = [];
            }
            if(arr.length == 0 || arr[arr.length - 1].priority >= priority){
                arr.push(func);
            }else{
                let other;
                for(let i = 0; i < arr.length; i++){
                    other = arr[i];
                    if(other.priority < priority){
                        arr.splice(i, 0, func);
                        break;
                    }
                }
            }

            if(immediate)
                this::func(this._value);
        }
    }

    /**
     * Removes a listener.
     * @private
     * @param {string} arrName - The event collection to remove from.
     * @param {Function} func - The function to remove.
     */
    _removeListener(arrName, func){
        if(arrName in this){
            let arr = this[arrName];
            let i = arr.indexOf(func);
            if(i != -1){
                arr.splice(i, 1);
                if(arr.length == 0)
                    delete this[arrName];
            }
        }
    }

    /**
     * Returns the event array name for the given event.
     * @private
     * @param {string} event - The event to get for.
     * @returns {string} The array name.
     */
    static _getEventArrName(event){
        let arrName;
        switch(event){
            case 'pre-update':
            case 'post-update':
            case 'update':
            case 'finalize':
            case 'constant':
                arrName = `${event}-listeners`;
                break;
            case 'filter':
                arrName = 'filters';
                break;
            default:
                throw new Error(`[Dynx] Unrecognized event ${event}.`);
        }
        return arrName;
    }

    /**
     * Adds a new handler for a specific event.
     * @param {string} event - The event to handle (update, preUpdate, postUpdate, filter, finalize, constant)
     * @param {Filter|Listener} handler - The handler function.
     * @param {boolean} [immediate=false] - True make an initial call to the handler.
     * @param {number} [priority=0] - The priority of the handler (high is first).
     * @return {Dynx} This for chaining.
     */
    on(event, handler, immediate=false, priority=0){
        if(event === 'filter' && immediate)
            throw new Error('[Dynx] Cannot use immediate with filter.');
        let arrName = Dynx._getEventArrName(event);
        this._addListener(arrName, handler, immediate, priority);
        if(event === 'filter')
            this.update();
        return this;
    }

    /**
     * Removes a handle from a specific event.
     * @param {string} event - The event to no longer handle (update, preUpdate, postUpdate, filter, finalize, constant)
     * @param {Filter|Listener} handler - The handler function.
     * @return {Dynx} This for chaining.
     */
    off(event, handler){
        let arrName = Dynx._getEventArrName(event);
        this._removeListener(arrName, handler);
        if(event === 'filter')
            this.update();
        return this;
    }

    /**
     * Invalidates and returns this Dynx.
     * @return {Dynx} This for chaining.
     */
    invalidate(){
        this.value = INVALID;
        return this;
    }

    /**
     * Makes this Dynx final with the given expression. If the value is omitted, uses the current expression.
     * @param {Expression} exp - The expression to finalize with.
     * @return {Dynx} This for chaining.
     */
    finalize(exp=NO_ARG){
        if(this.isFinal)
            return this;
        if(exp !== NO_ARG){
            if(this.isFinal)
                throw new Error('[Dynx] Cannot change the value of a finalized Dynx.');
            if(typeof exp !== 'function')
                throw new Error(`[Dynx] Exp must be a function, not ${exp}.`);
            this._exp = exp;
        }
        this._isFinal = true;
        this.update(true);
        this._triggerEvent('finalize', this._value);
        return this;
    }

    /**
     * Makes this Dynx a constant with the given value. If the value is omitted, uses the current value of the Dynx.
     * @param {*} [value] - The value to mark as a constant with.
     * @return {Dynx} This for chaining.
     */
    constant(value=NO_ARG){
        if(this.isConstant)
            return this;
        if(value !== NO_ARG){
            if(this.isFinal)
                throw new Error('[Dynx] Cannot change the value of a finalized Dynx.');
            this._init_value = value;
        }
        delete this._exp;
        this._isFinal = true;
        this.update(true);
        this._triggerEvent('constant', this._value);
        return this;
    }
}

/**
 * The stack of currently-evaluating Dynxes.
 * @private
 * @type {Array}
 */
Dynx._childStack = function(){
    let stack = [];
    //create top prop for convenience
    Object.defineProperty(stack, 'top', {
        get(){
            return this[this.length - 1];
        }
    });
    return stack;
}();
//add to class for easy access
Dynx.INVALID = INVALID;


//defined a wrapper function that allows new-less calls to set the expression.
export default (function(originalDynx) {
    /**
     * Creates a new Dynx with an optional initial value or expression.
     * Treats input as value if called with new, and as an expression if called without.
     * @constructor
     * @param {*|Expression} [value] - The initial value or expression.
     * @returns {Dynx} - The new Dynx instance.
     */
    const Dynx = function Dynx(value){
        if(this && this instanceof Dynx){
            return new originalDynx(...arguments);
        }else{
            let dynx = new Dynx(undefined);
            dynx.exp = value;
            return dynx;
        }
    };
    //fix inheritance
    Dynx.prototype = originalDynx.prototype;
    //fix .constructor
    Dynx.prototype.constructor = Dynx;
    //fix static methods
    Object.setPrototypeOf(Dynx, originalDynx);
    initTransform(Dynx);
    return Dynx;
}(Dynx));
