export function init(Dynx){
    //TODO: Reevaluate this and decide what changes/improvements I want to make

    /**
     * An condition function for a Dynx.
     * @typedef {Function} Condition
     * @param {*} value - The value to be tested.
     * @returns {boolean} True if the then should be returned.
     */

    /**
     * A transformer for a Dynx.
     * @typedef {Function} Transformer
     * @param {*} parentDynx - The parent dynx instance.
     * @returns {*} The transformed value.
     */

    /**
     * Creates a condition.
     * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a truthy test.
     * @this Dynx
     * @param {Condition|*} condition - The condition to test.
     * @param {*} [then] - The result to return on success.
     * @returns {Dynx} This conditional for chaining.
     */
    function ifFunc(condition, then){
        if(arguments.length == 1){
            return ifFunc.call(this, x => Boolean(x), ...arguments);
        }
        //if static, we need to recreate to "change"
        if(this.isFinal){
            let thens = [...this._ifThens];
            this._ifThens.push({condition, then});
            return createCond(this._parent, thens, this._elseThen);
        }else{
            this._ifThens.push({condition, then});
            this.update();
        }
        return this;
    }

    /**
     * Creates an inverted condition.
     * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a falsey test.
     * @this Dynx
     * @param {Condition|*} condition - The condition to inversely test.
     * @param {*} [then] - The result to return on success.
     * @returns {Dynx} This conditional for chaining.
     */
    function ifNotFunc(condition, then){
        if(arguments.length == 1){
            return ifFunc.call(this, x => !Boolean(x), ...arguments);
        }else{
            return ifFunc.call(this, x => !condition(x), then);
        }
    }

    /**
     * Sets the else value.
     * @this Dynx
     * @param {*} then - The value to return if all conditions fail.
     * @returns {Dynx} This conditional for chaining.
     */
    function elseFunc(then){
        //if static, we need to recreate to "change"
        if(this.isFinal){
            return createCond(this._parent, this._ifThens, then);
        }else{
            this._elseThen = then;
            this.update();
        }
        return this;
    }

    /** @this Dynx */
    function expression(){
        let value = this._parent.value;
        if(this._ifThens){
            for(let {condition, then} of this._ifThens){
                if(condition(value)) {
                    return then;
                }
            }
        }
        return this._elseThen;
    }

    function createCond(parentDynx, _ifThens=[], _elseThen=undefined){
        let cond = new Dynx();
        cond._parent = parentDynx;
        cond._ifThens = _ifThens;
        cond._elseThen = _elseThen;
        cond.if = ifFunc;
        cond.ifnot = ifNotFunc;
        cond.else = elseFunc;
        cond.finalize(expression);
        return cond;
    }

    /**
     * Creates a new if-conditional Dynx with the given condition.
     * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a truthy test.
     * @this Dynx
     * @param {Condition|*} condition - The condition to test.
     * @param {*} [then] - The result to return on success.
     * @returns {Dynx} This conditional for chaining.
     */
    Dynx.prototype.if = function(condition, then){
        return createCond(this).if(...arguments);
    };

    /**
     * Creates a new if-conditional Dynx with the given inverted condition.
     * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a falsey test.
     * @this Dynx
     * @param {Condition|*} condition - The condition to inversely test.
     * @param {*} [then] - The result to return on success.
     * @returns {Dynx} This conditional for chaining.
     */
    Dynx.prototype.ifnot = function(condition, then){
        return createCond(this).ifnot(...arguments);
    };

    /**
     * Creates a new switch-conditional Dynx.
     * @returns {Dynx} A new switch-conditional Dynx.
     */
    Dynx.prototype.switch = function(){
        let cond = createCond(this);
        delete cond.if;
        delete cond.ifnot;
        delete cond.else;
        /**
         * Creates a case.
         * @this Dynx
         * @param {*|Dynx} value - The value to match.
         * @param {*} then - The result to return on success.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.case = function(value, then){
            return ifFunc.call(this, x => x === resolve(value), then);
        };
        /**
         * Sets the default case.
         * @this Dynx
         * @param {*} then - The value to return if all matches fail.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.default = function(then){
            return elseFunc.call(this, then);
        };
        return cond;
    };

    /**
     * Creates a new transformation Dynx.
     * @param {Transformer} func - The transforming function.
     * @returns {Dynx} A new transformation Dynx.
     */
    Dynx.prototype.transform = function(func){
        return Dynx(() => func(this.value)).finalize();
    };

    /**
     * Creates a new attribute Dynx.
     * @param {(string|Dynx)[]} keys - The attribute to get on the value.
     * @returns {Dynx} A new attribute Dynx.
     */
    Dynx.prototype.attr = function(...keys){
        let trans = new Dynx();
        trans.exp = () => {
            let obj = this.value;
            if(obj === INVALID)
                return INVALID;
            for(let key of keys){
                if(obj == null)
                    break;
                obj = obj[resolve(key)];
            }
            return obj;
        };
        trans.finalize();
        return trans;
    };

    /**
     * Creates a new function call Dynx.
     * @param {string|Dynx} name - The function attribute to get on the value.
     * @param {...*|Dynx} [args] - The arguments to call a function attribute with.
     * @returns {Dynx} A new attribute Dynx.
     */
    Dynx.prototype.func = function(name, ...args){
        let trans = new Dynx(undefined);
        trans.exp = () => {
            let obj = this.value;
            if(obj){
                let result = obj[resolve(name)];
                result = result.call(obj, ...args.map(resolve));
                return result;
            }
        };
        return trans;
    };

    function resolve(obj){
        if(obj instanceof Dynx)
            return obj.value;
        else
            return obj;
    }
}