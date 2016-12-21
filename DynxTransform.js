export function init(Dynx, DynxType){
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

    function createBasicCond(parentDynx, _ifThens=[], _elseThen=undefined){
        let cond = new Dynx();
        cond.type = DynxType.INHERIT;
        cond._ifThens = _ifThens;
        cond._elseThen = _elseThen;
        /**
         * Creates a condition.
         * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a truthy test.
         * @this Dynx
         * @param {Condition|*} condition - The condition to test.
         * @param {*} [then] - The result to return on success.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.if = function(condition, then){
            if(arguments.length == 1){
                return cond.if(x => Boolean(x), ...arguments);
            }
            this._ifThens.push({condition, then});
            //if static, we need to recreate to "change"
            if(this.type == DynxType.STATIC){
                return createBasicCond(parentDynx, _ifThens, _elseThen);
            }else{
                this.update();
            }
            return this;
        };
        /**
         * Creates an inverted condition.
         * Note: If called with one parameter, the parameter becomes the "then" and the condition becomes a falsey test.
         * @this Dynx
         * @param {Condition|*} condition - The condition to inversely test.
         * @param {*} [then] - The result to return on success.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.ifnot = function(condition, then){
            if(arguments.length == 1){
                return cond.if(x => !Boolean(x), ...arguments);
            }else{
                return cond.if(x => !condition(x), then);
            }
        };
        /**
         * Sets the else value.
         * @this Dynx
         * @param {*} then - The value to return if all conditions fail.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.else = function(then){
            this._elseThen = then;
            //if static, we need to recreate to "change"
            if(this.type == DynxType.STATIC){
                return createBasicCond(parentDynx, _ifThens, _elseThen);
            }else{
                this.update();
            }
            return this;
        };
        /** @this Dynx */
        cond.exp = function(){
            let value = parentDynx.value;
            if(this._ifThens){
                for(let {condition, then} of this._ifThens){
                    if(condition(value)) {
                        return then;
                    }
                }
            }
            return this._elseThen;
        };
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
        return createBasicCond(this).if(...arguments);
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
        return createBasicCond(this).ifnot(...arguments);
    };

    function createSwitchCond(parentDynx, _cases={}, _defaultCase=undefined){
        let cond = new Dynx();
        cond.type = DynxType.INHERIT;
        cond._cases = _cases;
        cond._defaultCase = _defaultCase;
        /**
         * Creates a case.
         * @this Dynx
         * @param {*} value - The value to match.
         * @param {*} then - The result to return on success.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.case = function(value, then){
            this._cases[value] = then;
            //if static, we need to recreate to "change"
            if(this.type == DynxType.STATIC){
                return createSwitchCond(_cases, _defaultCase);
            }else{
                this.update();
            }
            return this;
        };
        /**
         * Sets the default case.
         * @this Dynx
         * @param {*} then - The value to return if all matches fail.
         * @returns {Dynx} This conditional for chaining.
         */
        cond.default = function(then){
            this._defaultCase = then;
            //if static, we need to recreate to "change"
            if(this.type == DynxType.STATIC){
                return createSwitchCond(_cases, _defaultCase);
            }else{
                this.update();
            }
            return this;
        };
        /** @this Dynx */
        cond.exp = function(){
            let value = parentDynx.value;
            if(value in this._cases){
                return this._cases[value];
            }else{
                return this._defaultCase;
            }
        };
        return cond;
    }

    /**
     * Creates a new switch-conditional Dynx.
     * @returns {Dynx} A new switch-conditional Dynx.
     */
    Dynx.prototype.switch = function(){
        return createSwitchCond(this);
    };

    /**
     * Creates a new transformation Dynx.
     * @param {Transformer} func - The transforming function.
     * @returns {Dynx} A new transformation Dynx.
     */
    Dynx.prototype.transform = function(func){
        let trans = new Dynx();
        trans.type = DynxType.INHERIT;
        trans.exp = () => {
            return func(this.value);
        };
        return trans;
    };

    /**
     * Creates a new attribute Dynx.
     * @param {string} name - The attribute to get on the value.
     * @param {...*} [args] - The arguments to call a function attribute with.
     * @returns {Dynx} A new attribute Dynx.
     */
    Dynx.prototype.attr = function(name, ...args){
        let trans = new Dynx();
        trans.type = DynxType.INHERIT;
        trans.exp = () => {
            let obj = this.value;
            if(obj){
                let result = obj[name];
                if(typeof result === 'function'){
                    let specificArgs = args.map(value => {
                        if(value instanceof Dynx){
                            return value.value;
                        }else{
                            return value;
                        }
                    });
                    result = result.call(obj, ...specificArgs);
                }
                return result;
            }
        };
        return trans;
    };
}