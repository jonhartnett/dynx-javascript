import {init as initTransform} from "./DynxTransform";

/**
 * Enum for Dynx types.
 * @readonly
 * @enum {number}
 */
//internally, types with larger values trump types with smaller for inherit calculations.
export const DynxType = {
    /**
     * A static/temporary/constant dynx whose value doesn't change.
     * Unlike other types, a STATIC can never change to another.
     * Primarily used to simulate Dynx functions for non-Dynx values, or mark other types as finalized.
     */
    STATIC: 0,
    /**
     * A dynamic/changing/async dynx whose value changes.
     */
    DYNAMIC: 1,
    /**
     * A invalid/unloaded/async dynx whose value is not yet valid.
     */
    INVALID: 2,
    /**
     * A temporary type that inherits from values in expression.
     */
    INHERIT: 3
};

const TYPE = Symbol('type');
const VALUE = Symbol('value');
const EXP = Symbol('exp');
const CALL_LISTENERS = Symbol('callListeners');
const REFRESH_HANDLE = Symbol('refreshHandle');
const ADD_LiSTENER = Symbol('addListener');
const REMOVE_LISTENER = Symbol('removeListener');

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
     * Creates a new Dynx with an optional initial value.
     * @constructor
     * @param {*} [initial=undefined] - The initial constant value.
     * @param {DynxType} [type=DYNAMIC] - The initial DynxType.
     */
    constructor(initial=undefined, type=DynxType.DYNAMIC) {
        this[VALUE] = initial;
        this[TYPE] = type;
    }

    /**
     * Gets the current type.
     * @returns {DynxType} The type.
     */
    get type(){
        return this[TYPE];
    }

    /**
     * Sets the current type.
     * @param {DynxType} value - The new type.
     */
    set type(value){
        if(this.type === DynxType.STATIC)
            throw new Error('[Dynx] Cannot modify a static Dynx.');
        if(this[TYPE] !== value){
            let oldType = this[TYPE];
            this[TYPE] = value;
            if(oldType === DynxType.INVALID)
                this.update(true);
            //update all listeners
            this[CALL_LISTENERS]('typeChanges');
        }
    }

    /**
     * Gets the current value.
     * @returns {*} The current value.
     */
    get value() {
        //if currently evaluating an expression, add a subscription
        if(Dynx.childStack.length > 0){
            let top = Dynx.childStack.top;
            if(top !== undefined && top !== this)
            {
                if(top.type === DynxType.INHERIT){
                    top.pendingType = Math.max(top.pendingType, this.type);
                }
                if(this.type !== DynxType.STATIC){
                    this.onUpdateSub(top.updateHandle);
                }
            }
        }
        //return value
        return this[VALUE];
    }

    /**
     * Sets the current value.
     * @param {*} value - The new constant value.
     */
    set value(value) {
        if(this.type === DynxType.STATIC)
            throw new Error('[Dynx] Cannot change the value of a static Dynx.');
        //make exp undefined to mark as constant
        delete this[EXP];
        if(this[VALUE] !== value){
            //set value and update
            this[VALUE] = value;
            if(this.type !== DynxType.INVALID)
                this.update(true);
        }
    }

    /**
     * Gets the current expression.
     * @returns {Expression} The expression, or undefined if a constant.
     */
    get exp() {
        return this[EXP];
    }

    /**
     * Sets the current expression.
     * @param {Expression} value - The new expression.
     */
    set exp(value) {
        if(this.type === DynxType.STATIC)
            throw new Error('[Dynx] Cannot change the value of a static Dynx.');
        //set expression and update
        if(typeof value !== 'function'){
            throw new Error(`[Dynx] Exp must be a function, not ${value}.`)
        }
        this[EXP] = value;
        if(this.type !== DynxType.INVALID)
            this.update();
    }

    /**
     * Updates the value of this Dynx based on the expression.
     * @param {boolean} [force=true] - True if update listeners should be called regardless of value change.
     */
    update(force=false) {
        //call preUpdate listeners
        if(this.preupdates)
            for(let listener of this.preupdates)
                listener.call(this);

        //createElement var for new values
        let newValue = this[VALUE];

        //if inherit, create pending var with initial type
        if(this.type === DynxType.INHERIT){
            this.pendingType = DynxType.STATIC;
        }

        //only evaluate if something might have changed
        if(this[EXP] || this.filters) {
            //createElement new handle
            this[REFRESH_HANDLE]();
            //set child so we catch parents from evaluation and filtering
            Dynx.childStack.push(this);

            //evaluate expression
            if(this[EXP])
                newValue = this[EXP].call(this);
            //filter value
            if(this.filters)
                for(let filter of this.filters)
                    newValue = filter.call(this, newValue);

            Dynx.childStack.pop();
        }

        //if inherit, set new type
        if(this.type === DynxType.INHERIT){
            this.type = this.pendingType;
            delete this.pendingType;
        }

        //if changed, update VALUE and call listeners
        if(newValue !== this[VALUE] || force){
            //set value to new
            this[VALUE] = newValue;
            //update all listeners
            this[CALL_LISTENERS]('updates');
        }

        //call postUpdate listeners
        if(this.postupdates)
            for(let listener of this.postupdates)
                listener.call(this);

        //delete any unneeded references
        if(this.type === DynxType.STATIC){
            delete this.preupdates;
            delete this[EXP];
            delete this.filters;
            delete this.updates;
            delete this.postupdates;
        }
    }

    /**
     * Calls this Dynx's listeners.
     * @param {string} name - The type of listener.
     * @private
     */
    [CALL_LISTENERS](name){
        //this method would be a simple loop with recursion, but listeners are called in a queue fashion to avoid stack overflows

        const queueName = name + 'Queue';
        const progressName = name + 'InProgress';

        if(!Dynx[queueName])
            Dynx[queueName] = [];
        //queue listeners for update
        if(this[name]){
            let listeners = this[name];
            for(let i = 0; i < listeners.length; i++) {
                let listener = listeners[i];
                if(listener.obsolete){
                    listeners.splice(i--, 1);
                    if(listeners.length === 0){
                        delete this[name];
                        break;
                    }
                }else{
                    Dynx[queueName].push(() => listener.call(this));
                }
            }
        }
        //if master manager hasn't been start, start one
        if(!Dynx[progressName]){
            Dynx[progressName] = true;
            let listener;
            while(listener = Dynx[queueName].shift()){
                listener();
            }
            Dynx[progressName] = false;
            delete Dynx[queueName];
        }
    }

    /**
     * Refreshes this Dynx's update handle, which effectively discards all old parents.
     */
    [REFRESH_HANDLE](){
        //delete old handle
        if(this.updateHandle)
            this.updateHandle.obsolete = true;
        //create new one
        this.updateHandle = () => this.update();
    }

    /**
     * Executes a block without subscribing to any Dynxes triggered.
     * @param {Function} func - The function to be called.
     * @param {[]} args - The arguments to call with.
     * @returns {*} The return of the function.
     */
    executeImmune(func, ...args){
        if(this !== Dynx.childStack.top){
            throw new Error("[Dynx] SEVERE: Immune statements can only be executed immediately within a variable's expression function.")
        }
        Dynx.childStack.push(undefined);
        let result = func(...args);
        Dynx.childStack.pop();
        return result;
    }

    /**
     * Adds a listener.
     * @private
     * @param {string} group - The group (property) to add to.
     * @param {Function} func - The function to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    [ADD_LiSTENER](group, func, first){
        if(this.type === DynxType.STATIC)
            console.error('[Dynx] Subscription to a STATIC is unnecessary!');
        if(!this[group])
            this[group] = [];
        if(first)
            this[group].unshift(func);
        else
            this[group].push(func);
    }

    /**
     * Removes a listener.
     * @private
     * @param {string} group - The group (property) to remove from.
     * @param {Function} func - The function to remove.
     */
    [REMOVE_LISTENER](group, func){
        if(!this[group])
            return;
        let index = this[group].indexOf(func);
        if(index !== -1){
            this[group].splice(index, 1);
            if(this[group].length === 0)
                delete this[group];
        }
    }

    /**
     * Adds a new filter.
     * @param {Filter} handler - The filter to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    onFilterSub(handler, first=false){
        this[ADD_LiSTENER]('filters', handler, first);
        this.update();
    }

    /**
     * Removes a filter.
     * @param {Filter} handler - The filter to remove.
     */
    onFilterUnsub(handler) {
        this[REMOVE_LISTENER]('filters', handler);
        this.update();
    }

    /**
     * Adds a new update listener.
     * @param {Listener} handler - The listener to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    onUpdateSub(handler, first=false) {
        this[ADD_LiSTENER]('updates', handler, first);
    }

    /**
     * Removes an update listener.
     * @param {Listener} handler - The listener to remove.
     */
    onUpdateUnsub(handler) {
        this[REMOVE_LISTENER]('updates', handler);
    }

    /**
     * Adds a new pre-update listener.
     * @param {Listener} handler - The listener to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    onPreUpdateSub(handler, first=false) {
        this[ADD_LiSTENER]('preupdates', handler, first);
    }

    /**
     * Removes a pre-update listener.
     * @param {Listener} handler - The listener to remove.
     */
    onPreUpdateUnsub(handler) {
        this[REMOVE_LISTENER]('preupdates', handler);
    }

    /**
     * Adds a new post-update listener.
     * @param {Listener} handler - The listener to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    onPostUpdateSub(handler, first=false) {
        this[ADD_LiSTENER]('postupdates', handler, first);
    }

    /**
     * Removes a post-update listener.
     * @param {Listener} handler - The listener to remove.
     */
    onPostUpdateUnsub(handler) {
        this[REMOVE_LISTENER]('postupdates', handler);
    }

    /**
     * Adds a new type-change listener.
     * @param {Listener} handler - The listener to add.
     * @param {boolean} [first=false] - True to insert at front of list.
     */
    onTypeChangeSub(handler, first=false) {
        this[ADD_LiSTENER]('typeChanges', handler, first);
    }

    /**
     * Removes a type-change listener.
     * @param {Listener} handler - The listener to remove.
     */
    onTypeChangeUnsub(handler) {
        this[REMOVE_LISTENER]('typeChanges', handler);
    }

    /**
     * Sets the value to the given and re-types to STATIC.
     * @param {*} value - The final value.
     * @see DynxType.STATIC
     */
    finalize(value){
        this.value = value;
        this.type = DynxType.STATIC;
    }

    valueOf(){
        return this.value;
    }
}
/**
 * The stack of currently-evaluating Dynxes.
 * @private
 * @type {Array}
 */
Dynx.childStack = function(){
    let stack = [];
    //create top prop for convenience
    Object.defineProperty(stack, 'top', {
        get: function(){
            return this[this.length - 1];
        }
    });
    return stack;
}();


//defined a wrapper function that allows new-less calls to set the expression.
export default (function(simpleDynx) {
    /**
     * Creates a new Dynx with an optional initial value or expression.
     * Treats input as value if called with new, and as an expression if called without.
     * @constructor
     * @param {*|Expression} [value] - The initial value or expression.
     * @param {DynxType} [type=DYNAMIC] - The type of the Dynx.
     * @returns {Dynx} - The new Dynx instance.
     */
    const Dynx = function Dynx(value, type=DynxType.DYNAMIC){
        if(this && this instanceof Dynx){
            return new simpleDynx(...arguments);
        }else{
            let dynx = new Dynx(undefined, type);
            dynx.exp = value;
            return dynx;
        }
    };
    Dynx.prototype = simpleDynx.prototype;
    initTransform(Dynx, DynxType);
    return Dynx;
}(Dynx));
