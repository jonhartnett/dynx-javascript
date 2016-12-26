const mocha = require('mocha');
const assert = require('chai').assert;
const { 'default': Dynx, INVALID } = require('../Dynx.min');

mocha.describe('Dynx', () => {
    mocha.describe('value', () => {
        mocha.it('can be initialized', () => {
            let dynx = new Dynx(undefined);
            assert.strictEqual(dynx.value, undefined);
        });
        mocha.it('can change', () => {
            let dynx = new Dynx(undefined);
            dynx.value = 'test';
            assert.strictEqual(dynx.value, 'test');
        });
        mocha.it('can replace an expression', () => {
            let dynx = Dynx(() => 'test');
            dynx.value = 7;
            assert.strictEqual(dynx.value, 7);
            assert.equal(dynx.exp, null);
        });
    });
    mocha.describe('expression', () => {
        mocha.it('can be initialized', () => {
            let dynx = Dynx(() => 'test');
            assert.strictEqual(dynx.value, 'test');
        });
        mocha.it('can change', () => {
            let i = 0;
            let dynx = Dynx(() => i);
            assert.strictEqual(dynx.value, 0);
            i++;
            dynx.update();
            assert.strictEqual(dynx.value, 1);
        });
        mocha.it('can replace a constant', () => {
            let dynx = new Dynx('test');
            dynx.exp = () => 7;
            assert.strictEqual(dynx.value, 7);
            assert.notEqual(dynx.exp, null);
        });
        mocha.it('can execute immune blocks', () => {
            let counter = 0;
            let dynx;
            Dynx(() => {
                counter++;
                if(!dynx){
                    dynx = new Dynx(0);
                    dynx.value++;
                }
            });
            assert.equal(counter, 2);
            dynx.value++;
            assert.equal(counter, 2);

            counter = 0;
            dynx = undefined;
            Dynx(() => {
                counter++;
                if(!dynx){
                    Dynx.immune(() => {
                        dynx = new Dynx(0);
                        dynx.value++;
                    });
                }
            });
            assert.equal(counter, 1);
            dynx.value++;
            assert.equal(counter, 1);
        });
    });
    mocha.describe('filter', () => {
        mocha.it('is triggered', () => {
            let dynx = new Dynx('test');
            assert.strictEqual(dynx.value, 'test');
            dynx.on('filter', x => x.toUpperCase());
            assert.strictEqual(dynx.value, 'TEST');
        });
        mocha.it('uses original constant', () => {
            let first = true;
            let dynx = new Dynx('test');
            assert.strictEqual(dynx.value, 'test');
            dynx.on('filter', x => {
                if(first)
                    return x.toUpperCase();
                else
                    return x[0].toUpperCase() + x.slice(1);
            });
            assert.strictEqual(dynx.value, 'TEST');
            first = false;
            dynx.update();
            assert.strictEqual(dynx.value, 'Test');
        });
    });
    mocha.describe('linking', () => {
        mocha.it('can link in expression', () => {
            let dynx1 = new Dynx('test');
            let dynx2 = Dynx(() => dynx1.value.toUpperCase());
            assert.strictEqual(dynx1.value, 'test');
            assert.strictEqual(dynx2.value, 'TEST');
            dynx1.value = 'another string';
            assert.strictEqual(dynx1.value, 'another string');
            assert.strictEqual(dynx2.value, 'ANOTHER STRING');
        });
        mocha.it('can link in filter', () => {
            let dynx1 = new Dynx(String.prototype.toUpperCase);
            let dynx2 = new Dynx('Test');
            dynx2.on('filter', str => dynx1.value.call(str));
            assert.strictEqual(dynx2.value, 'TEST');
            dynx1.value = String.prototype.toLowerCase;
            assert.strictEqual(dynx2.value, 'test');
        });
        mocha.it('uses minimal/dynamic subscription', () => {
            let fork = new Dynx(true);
            let in1 = new Dynx(0);
            let in2 = new Dynx(1);
            let out = Dynx(() => {
                if(fork.value)
                    return in1.value;
                else
                    return in2.value;
            });
            let called;
            out.on('pre-update', () => called = true);

            called = false;
            in1.value++;
            assert.isTrue(called);

            called = false;
            in2.value++;
            assert.isFalse(called);

            called = false;
            fork.value = false;
            assert.isTrue(called);

            called = false;
            in1.value++;
            assert.isFalse(called);

            called = false;
            in2.value++;
            assert.isTrue(called);
        });
    });
    mocha.describe('event', () => {
        mocha.it('sends updates', () => {
            let counter = null;
            let preCounter = null;
            let postCounter = null;
            let dynx = new Dynx(0);
            let updateListener = () => counter = dynx.value;
            dynx.on('update', updateListener);
            dynx.on('pre-update', () => preCounter = dynx.value);
            dynx.on('post-update', () => postCounter = dynx.value);
            for(let i = 0; i < 5; i++){
                dynx.value++;
                assert.strictEqual(counter, dynx.value, 'update');
                assert.strictEqual(preCounter, dynx.value - 1, 'pre-update');
                assert.strictEqual(postCounter, dynx.value, 'post-update');
            }
            dynx.off('update', updateListener);
            dynx.value++;
            assert.notStrictEqual(counter, dynx.value, 'update');

        });
        mocha.it('obeys force', () => {
            let changeCount = 0;
            let preChangeCount = 0;
            let postChangeCount = 0;
            let dynx = new Dynx(0);
            dynx.on('update', () => changeCount++);
            dynx.on('pre-update', () => preChangeCount++);
            dynx.on('post-update', () => postChangeCount++);

            dynx.value++;
            assert.strictEqual(changeCount, 1);
            assert.strictEqual(preChangeCount, 1);
            assert.strictEqual(postChangeCount, 1);
            dynx.value = 1;
            assert.strictEqual(changeCount, 1);
            assert.strictEqual(preChangeCount, 1);
            assert.strictEqual(postChangeCount, 1);
            dynx.update(true);
            assert.strictEqual(changeCount, 2);
            assert.strictEqual(preChangeCount, 2);
            assert.strictEqual(postChangeCount, 2);
            dynx.update(false);
            assert.strictEqual(changeCount, 2);
            assert.strictEqual(preChangeCount, 3);
            assert.strictEqual(postChangeCount, 3);

        });
        mocha.it('calls immediates', () => {
            let called = false;
            let dynx = new Dynx();
            dynx.on('update', () => called = true, true);
            dynx.update(true);
            assert.isTrue(called);
        });
        mocha.it('obeys priority', () => {
            let counter = 0;
            let one = 0, two = 0, three = 0, four = 0, five = 0;
            let dynx = new Dynx();
            dynx.on('update', () => one = ++counter, false);
            dynx.on('update', () => two = ++counter, false, 1);
            dynx.on('update', () => three = ++counter, false, -1);
            dynx.on('update', () => four = ++counter, false);
            dynx.on('update', () => five = ++counter, false, 1);
            dynx.update(true);
            assert.equal(two, 1, 'two');
            assert.equal(five, 2, 'five');
            assert.equal(one, 3, 'one');
            assert.equal(four, 4, 'four');
            assert.equal(three, 5, 'three');
        });
    });
    mocha.describe('lifetime', () => {
        mocha.it('can be invalidated', () => {
            let dynx = new Dynx(5);
            assert.equal(dynx.value, 5);
            assert.isFalse(dynx.isInvalid);
            dynx.invalidate();
            assert.equal(dynx.value, INVALID);
            assert.isTrue(dynx.isInvalid);
            dynx.value = 5;
            assert.equal(dynx.value, 5);
            assert.isFalse(dynx.isInvalid);
        });
        mocha.it('can be made constant', () => {
            let dynx = new Dynx(5);
            let dynx2 = Dynx(() => dynx.value).finalize();
            assert.equal(dynx.value, 5);
            assert.equal(dynx2.value, 5);
            assert.isFalse(dynx.isConstant);
            assert.isFalse(dynx.isFinal);
            assert.isFalse(dynx2.isConstant);
            assert.isTrue(dynx2.isFinal);
            dynx.constant(3);
            assert.equal(dynx.value, 3);
            assert.equal(dynx2.value, 3);
            assert.isTrue(dynx.isConstant);
            assert.isTrue(dynx.isFinal);
            assert.isTrue(dynx2.isConstant);
            assert.isTrue(dynx2.isFinal);
        });
    });
});