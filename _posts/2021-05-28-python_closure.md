---
layout: post
title:  "Python 闭包的实现原理——对closure和callback的分析"
date:   2021-5-28
categories: python
---
* TOC
{:toc}

# 什么是闭包
>对维基上的解释做一个小总结：  
>闭包（Closure）又称词法闭包或函数闭包，是一个函数和其关联环境的实体，这样即便脱离创建的上下文，闭包也同样能照常运行。

在Python对于闭包的实现中，闭包关联的环境为一个变量环境，也就是一个引用外部变量的集合（`co_freevars`），这些变量被称为自由变量（`free_variable`），
自由变量是函数使用到的外层作用域中的变量。  
既然闭包提供了函数关联外部变量、脱离定义环境执行的机制，那么就可以用它实现[简化代码](https://python3-cookbook.readthedocs.io/zh_CN/latest/c07/p09_replace_single_method_classes_with_functions.html)、[装饰器](https://python3-cookbook.readthedocs.io/zh_CN/latest/c09/p01_put_wrapper_around_function.html)、带额外状态的回调函数等功能。  
下面通过一个常见场景中的使用错误，逐步剖析Python闭包的实现原理以及如何合理的使用闭包。  

# 使用场景
闭包经常作为回调进行使用，比如一个异步的IO、网络、定时器啥的。如果代码写的不够严谨，在对象需要被回收的时候，回调出去的函数依然被其他地方引用住，就会导致该对象的内存泄漏。  
>例：
>在RPC一个远程节点的时候，设置了RPC响应时的回调，一般实现会生成req_id到callback的映射关系到上下文中，在RPC响应的时候再通过req_id拿到callback，pop出并执行。  
>如果网络波动，RPC请求未得到响应，如果未做超时处理，那么callback就不会pop出，导致callback被一个长周期的上下文引用，如果这时候想释放函数所在的对象就会释放失败，造成该对象的内存泄漏。  

## 测试用例
**2个`Component`类：**

```
class Component1(object):
    def __init__(self):
        self.cb = None

    def __del__(self):
        print("Component1 del")

class Component2(object):
    def set_cb(self, comp):
        comp.cb = lambda: self.normal_cb()

    def normal_cb(self):
        print("normal cb exec")

    def __del__(self):
        print("Component2 del")
```

**测试代码：**

```
def test():
    import gc
    comp1 = Component1()
    comp2 = Component2()
    print('comp1 ref={}'.format(sys.getrefcount(comp1)))
    print('comp2 ref={}'.format(sys.getrefcount(comp2)))

    for ins in gc.get_referrers(comp2):
        print('ins={}, ref={}'.format(str(ins), sys.getrefcount(ins)))
    ins = None

    # case 1 
    # comp1.cb = comp2.normal_cb
    # case 2 
    comp1.cb = lambda: comp2.normal_cb()
    # case 3 
    # comp2.set_cb(comp1)

    print('comp2 ref={}'.format(sys.getrefcount(comp2)))

    for ins in gc.get_referrers(comp2):
        print('ins={}, ref={}'.format(str(ins), sys.getrefcount(ins)))
    ins = None

    print('comp1.cb.__code__.co_freevars={}'.format(comp1.cb.__code__.co_freevars))
    print('comp1.cb.__closure__={}'.format(comp1.cb.__closure__))

    comp2 = None
    wait = input("wait...")

if __name__ == "__main__":
    import sys
    print("test.__code__.co_varnames {}".format(test.__code__.co_varnames))
    print("test.__code__.co_freevars {}".format(test.__code__.co_freevars))
    print("test.__code__.co_cellvars {}".format(test.__code__.co_cellvars))
    test()
```

**测试结果：**  
case1是直接将`comp2`的一个函数，以绑定方法（bound method ）的方式传递到`comp1`中；而case2和case3都是通过lambda将函数封装一层闭包后再传递。  
分别测试case1~3，得到如下测试结果：

|测试|case1|case2|case3|
|:-:|:-:|:-:|:-:|
|comp2计数变化 |2->3|2->2|2->3|
|comp2=None后对象是否被回收|N|Y|N|

根据测试结果，通过case1和case3方式设置回调后，`comp2`的引用计数都+1，并且在后续需要回收`comp2`的时候，设置`comp2 = None`后，对象依然存在其他引用导致回收失败。  
case2方式`comp2`的计数却未发现变化，并且在后续也能够正常回收。  
为啥会出现这样的差异？这涉及到Python虚拟机中的函数机制以及对闭包的具体实现原理。

# 闭包实现原理

## 1 闭包相关的重要对象和属性

**cpython**中有几个对象和闭包的实现相关：  

**1.1 `PyCodeObject`**  
`PyCodeObject`是对源代码的静态表示，一个Code Block只会产生一个`PyCodeObject`，是编译时的结果。  
[PyCodeObject](https://github.com/python/cpython/blob/3.7/Include/code.h#L51)
```
/* Bytecode object */
typedef struct {
    PyObject_HEAD
    int co_argcount;            /* #arguments, except *args */
    int co_kwonlyargcount;      /* #keyword only arguments */
    int co_nlocals;             /* #local variables */
    int co_stacksize;           /* #entries needed for evaluation stack */
    int co_flags;               /* CO_..., see below */
    int co_firstlineno;         /* first source line number */
    PyObject *co_code;          /* instruction opcodes */
    PyObject *co_consts;        /* list (constants used) */
    PyObject *co_names;         /* list of strings (names used) */
    PyObject *co_varnames;      /* tuple of strings (local variable names) */
    PyObject *co_freevars;      /* tuple of strings (free variable names) */
    PyObject *co_cellvars;      /* tuple of strings (cell variable names) */
    ...
    ...

} PyCodeObject;
```

关注和闭包函数实现相关的属性：  
**co_freevars:** 自由变量元组，保存使用了外层作用域的变量名；  
**co_cellvars:** cell变量元组，保存嵌套作用域中使用的变量名。  
作为`PyCodeObject`的属性，是在编译时就确定，在测试代码中，可以分别通过  
`func_name.__code__.co_freevars`、`func_name.__code__.co_cellvars`获取函数对应的`co_freevars`和`co_cellvars`。  
回到测试用例，case2和case3的差异在于`comp1.cb`函数对应的`co_freevars`不同，也就是自由变量不同。  

```
case2:
comp1.cb.__code__.co_freevars=('comp2',)

case3:
comp1.cb.__code__.co_freevars=('self',)
```

这个差异会在后续产生什么影响？  
`co_freevars`和`co_cellvars`可以总结为编译器标记了是否使用外层作用域/被嵌套作用域的变量，后续运行期调用函数的时候，就是通过函数的`co_freevars`和`co_cellvars`构建闭包函数执行需要的环境。  

***

**1.2 `PyFrameObject`**  
`PyFrameObject`是虚拟机对于一个栈帧的模拟，Python虚拟机在执行函数调用的时候会动态的创建新的`PyFrameObject`对象。  
[PyFrameObject](https://github.com/python/cpython/blob/3.7/Include/frameobject.h#L47)
```
typedef struct _frame {
    PyObject_VAR_HEAD
    struct _frame *f_back;      /* previous frame, or NULL */
    PyCodeObject *f_code;       /* code segment */
    PyObject *f_builtins;       /* builtin symbol table (PyDictObject) */
    PyObject *f_globals;        /* global symbol table (PyDictObject) */
    PyObject *f_locals;         /* local symbol table (any mapping) */
    ...
    ...
    PyObject *f_localsplus[1];  /* locals+stack, dynamically sized */
} PyFrameObject;
```
其中有关闭包实现的属性为——`f_localsplus`，为一个`PyObject`的指针数组，大小为1。具体实现在`PyFrame_New`函数中。  
```
ncells = PyTuple_GET_SIZE(code->co_cellvars);
nfrees = PyTuple_GET_SIZE(code->co_freevars);
extras = code->co_stacksize + code->co_nlocals + ncells + nfrees;
```
`extras`就是`f_localsplus`指向的那片内存的大小，由四部分组成：运行时栈、局部变量、cell对象（对应`co_cellvars`）和free对象（对应`co_freevars`）。  
![图1 f_localsplus的内存布局](/assets/pic/2021-05-28-python_closure/localsplus.png)

***

**1.3 `PyFunctionObject`**  
Python虚拟机中函数这种抽象机制是通过`PyFunctionObject`对象来实现的，虚拟机在执行`def`函数声明语句的时候会创建一个`PyFunctionObject`对象，对应指令[MAKE_FUNCTION
](https://docs.python.org/3.7/library/dis.html?highlight=make_function#opcode-MAKE_FUNCTION)。  
[PyFunctionObject](https://github.com/python/cpython/blob/3.7/Include/funcobject.h#L41)
```
typedef struct {
    PyObject_HEAD
    PyObject *func_code;        /* 对应函数编译后的PyCodeObject对象 */
    PyObject *func_globals;     /* 函数运行时的global名字空间 */
    PyObject *func_defaults;    /* 默认参数（tuple或NULL） */
    PyObject *func_kwdefaults;  /* NULL or a dict */
    PyObject *func_closure;     /* 用于实现closure 对应__colsure__ */
    PyObject *func_doc;         /* 函数的文档(PyStringObject) */
    PyObject *func_name;        /* 函数名称，函数的__name__属性(PyStringObject) */
    PyObject *func_dict;        /* 函数的__dict__属性(PyDictObject或NULL) */
    PyObject *func_weakreflist; /* List of weak references */
    PyObject *func_module;      /* 函数的__module__, can be anything */
    PyObject *func_annotations; /* Annotations, a dict or NULL */
    PyObject *func_qualname;    /* The qualified name */

    /* Invariant:
     *     func_closure(__colsure__)对应编译确定的func_code->co_freevars
     *     func_closure contains the bindings for func_code->co_freevars, so
     *     PyTuple_Size(func_closure) == PyCode_GetNumFree(func_code)
     *     (func_closure may be NULL if PyCode_GetNumFree(func_code) == 0).
     */
} PyFunctionObject;
```
其中和闭包相关的属性为`func_closure`，和前面重点提及的`co_freevars`相对应，是**free变量对应的cell对象的元组**。  
如下简单闭包函数为例：  
```
def add(x):
    def do_add(v):
        return x + v
    return do_add
```
字节码如下  
```
2           0 LOAD_CLOSURE             0 (x)
            2 BUILD_TUPLE              1
            4 LOAD_CONST               1 (<code object do_add at 0x7fd771be35d0, file "Project/python_test/test.py", line 2>)
            6 LOAD_CONST               2 ('add.<locals>.do_add')
            8 MAKE_FUNCTION            8
           10 STORE_FAST               1 (do_add)

4          12 LOAD_FAST                1 (do_add)
           14 RETURN_VALUE
```
闭包函数创建对应于第2行的`def`关键字，对应字节指令为`MAKE_FUNCTION`，所以在`MAKE_FUNCTION`之前的指令都是为创建闭包函数做准备。  
`LOAD_CLOSURE`指令从`f_localsplus`中推变量名`x`对应位置的cell对象到栈顶，然后`BUILD_TUPLE`指令创建一个tuple，将从栈中POP出的cell对象放入tuple中，最后将这个tuple对象PUSH到栈顶。  
在执行了2个`LOAD_CONST`，分别将闭包函数对应的`PyCodeObject`和函数名（限定名称，不影响后续理解，暂时理解为函数名称）推入栈。  
到这里准备创建闭包函数的准备工作就做好了，`MAKE_FUNCTION`指令执行之前的运行时栈如下：  
![图2 `MAKE_FUNCTION`指令执行之前的运行时栈](/assets/pic/2021-05-28-python_closure/runtime_stack.png)

经过前面的准备，已经将需要的外部变量‘打包’成一个tuple，终于到了真正执行`MAKE_FUNCTION`创建闭包函数的时候了  
```
TARGET(MAKE_FUNCTION) {
            PyObject *qualname = POP();
            PyObject *codeobj = POP();
            PyFunctionObject *func = (PyFunctionObject *)
                PyFunction_NewWithQualName(codeobj, f->f_globals, qualname);

            Py_DECREF(codeobj);
            Py_DECREF(qualname);
            ...

            if (oparg & 0x08) {
                assert(PyTuple_CheckExact(TOP()));
                func ->func_closure = POP();
            }
            ...
        }
```
对照`MAKE_FUNCTION`的具体实现和运行时栈的状态，第一次POP拿到函数名，第二次POP拿到code对象，然后通过code对象、global命名空间和限定名称创建`PyFunctionObject`对象。  
通过指令参数`oparg`和`0x08`取与来判断参数是否包含自由变量的cell对象的元组，描述：  
`0x08 a tuple containing cells for free variables, making a closure`

第三次POP拿到了自由变量对应cell对象的元组，并且赋值给func对象的`func_closure`。  
所以到目前为止闭包函数已经构建好了`PyFunctionObject`对象，并且对应的`func_closure`已经被成功设置为使用到的外部变量的cell对象的tuple，即`func_closure`这个元组和`co_freevars`一一对应。  

***

**1.4 `PyCellObject`**  
前面多次提到过cell对象，对应数据结构为`PyCellObject`  

```
typedef struct {
    PyObject_HEAD
    PyObject *ob_ref;       /* Content of the cell or NULL when empty */
} PyCellObject;
```
维护一个`ob_ref`指向`PyObject`，可以理解为当变量被闭包使用时会被封装为cell对象，`ob_ref`指向变量对象本身。  

前面说到闭包函数创建之前会将cell对象打包成元组，那么cell对象创建又是在什么时机？  
不妨猜测，既然一个函数被嵌套作用域使用的变量在编译期已经确定并且将变量名存放在`co_cellvars`中，函数构建`MAKE_FUNCTION`阶段，只是构建一个`PyFunctionObject`对象以及关联函数使用到的外部变量的cell对象，并且 **`PyFunctionObject`对象只是对字节码指令和global命名空间的一种打包和运算方式[<sup>1</sup>](#refer-funcobj-summary-1)**，所以cell对象创建并不在闭包函数`MAKE_FUNCTION`阶段，
而是在外层函数的调用执行阶段。  

下面创建closure的部分，将分析函数的调用阶段，得出cell对象的创建时机以及`func_closure`的最终归属！  

***

## 2 创建colsure
函数调用执行阶段对应的指令为[CALL_FUNCTION](https://docs.python.org/3.7/library/dis.html?highlight=call_function#opcode-CALL_FUNCTION)，最终结果为构建一个新的`PyFrameObject`（栈帧）环境，并开始执行新的字节码指令循环。  
3.7版本的虚拟机（[cpython 3.7](https://github.com/python/cpython/tree/3.7)）在执行`CALL_FUNCTION`指令时，会进入`call_function`函数，然后对函数对象的类型以及是否满足`fastcall`条件进行判断。  

[call.c](https://github.com/python/cpython/blob/3.7/Objects/call.c)
```
PyObject *
_PyFunction_FastCallKeywords(PyObject *func, PyObject *const *stack,
                             Py_ssize_t nargs, PyObject *kwnames)
{
    // 拿到PyFunctionObject中的PyCodeObject，gloabl空间等信息
    PyCodeObject *co = (PyCodeObject *)PyFunction_GET_CODE(func);
    PyObject *globals = PyFunction_GET_GLOBALS(func);
    PyObject *argdefs = PyFunction_GET_DEFAULTS(func);
    PyObject *kwdefs, *closure, *name, *qualname;
    ...
    // 是否满足fastcall判断
    if (co->co_kwonlyargcount == 0 && nkwargs == 0 &&
        (co->co_flags & ~PyCF_MASK) == (CO_OPTIMIZED | CO_NEWLOCALS | CO_NOFREE))
    {
        ...
        return function_code_fastcall(co, stack, nargs, globals);
    }

    kwdefs = PyFunction_GET_KW_DEFAULTS(func);
    closure = PyFunction_GET_CLOSURE(func);  # 拿到func_closure
    name = ((PyFunctionObject *)func) -> func_name;
    qualname = ((PyFunctionObject *)func) -> func_qualname;
    ...
    // 一般通道
    return _PyEval_EvalCodeWithName((PyObject*)co, globals, (PyObject *)NULL,
                                    stack, nargs,
                                    nkwargs ? &PyTuple_GET_ITEM(kwnames, 0) : NULL,
                                    stack + nargs,
                                    nkwargs, 1,
                                    d, (int)nd, kwdefs,
                                    closure, name, qualname);
}
```
因为是闭包函数所以存在自由变量，所以`co_flags`不符合`CO_NOFREE`，只能走一般通道。  
注意在这一步骤通过`PyFunction_GET_CLOSURE`的宏，如果函数是闭包函数，已经拿到`MAKE_FUNCTION`阶段‘打包’好的cell对象元组，并传到下一步骤。  

[`_PyEval_EvalCodeWithName`](https://github.com/python/cpython/blob/3.7/Python/ceval.c#L3664)  
该函数，传进来一大堆参数，我们主要关注`co`（函数对应code对象）、`globals`（函数关联的global命名空间）、`closure`（函数的自由变量对应cell对象的元组）。  

> 注：`PyFunctionObject`工具人的使命到这已经完成，后续对新栈帧产生影响的是PyFunctionObject中存储的PyCodeObject对象和global名字空间，可以看到`func_closure`也通过参数传到了下一步骤。

该函数的最终目的是构建新的栈帧环境，为后续执行`PyEval_EvalFrameEx`开始一个新的字节码指令序列的循环做准备。  
进入`_PyEval_EvalCodeWithName`函数后，直接创建`PyFrameObject`对象  

```
    f = _PyFrame_New_NoTrack(tstate, co, globals, locals);
    fastlocals = f->f_localsplus;
    freevars = f->f_localsplus + co->co_nlocals;
```

**`func_closure`的最终归属**  
```
    /* Copy closure variables to free variables */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_freevars); ++i) {
        PyObject *o = PyTuple_GET_ITEM(closure, i);
        Py_INCREF(o);
        freevars[PyTuple_GET_SIZE(co->co_cellvars) + i] = o;
    }
```
闭包函数`MAKE_FUNCTION`阶段，拿到的自由变量对应的cell对象的元组，终于到了作用于新栈帧对象的阶段。  
因为`co_freevars`和`func_closure`(`closure`变量)对应，所以通过`co_freevars`的size遍历了`closure`，拿到cell对象放置到了前面`PyFrameObject`介绍过的`f_localsplus`中的free对象区域中。  
后续闭包函数对应的栈帧执行的时候，就能通过`LOAD_DEREF`指令方便的拿到外部变量了。  

```
        TARGET(LOAD_DEREF) {
            PyObject *cell = freevars[oparg];
            PyObject *value = PyCell_GET(cell);  // get ob_ref
            ...
            Py_INCREF(value);
            PUSH(value);
            DISPATCH();
        }
```

**cell对象的创建**  
回到`_PyEval_EvalCodeWithName`函数，对于`co_freevars`不为空的函数在这一阶段将关联的cell对象放到了`f_localsplus`中。对于`co_cellvars`不为空的函数则会在这一阶段创建cell对象。  

```
    /* Allocate and initialize storage for cell vars, and copy free
       vars into frame. */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_cellvars); ++i) {
        PyObject *c;
        Py_ssize_t arg;
        /* Possibly account for the cell variable being an argument. */
        /* 判断cell var是否是参数 */
        if (co->co_cell2arg != NULL &&
            (arg = co->co_cell2arg[i]) != CO_CELL_NOT_AN_ARG) {
            c = PyCell_New(GETLOCAL(arg));
            /* Clear the local copy. */
            SETLOCAL(arg, NULL);
        }
        /* ob_ref=NULL的PyCellObject占位 */
        else {
            c = PyCell_New(NULL);
        }
        if (c == NULL)
            goto fail;
        /* 添加到f_localsplus的cell对象区域 */
        SETLOCAL(co->co_nlocals + i, c);
    }
```
逐一为`co_cellvars`中的变量创建cell对象，并且这个cell对象的`ob_ref == NULL`，和前面的一样放置到`f_localsplus`的cell对象区域。  
>注：会发现`co_cellvars`存放的变量名基本存在感很低，后续对cell对象的访问也不会使用cell_name，原因是：Python函数机制将对局部变量符号的访问方式从对dict的查找变为对list的索引。

在后续变量的赋值语句出，通过`STORE_DEREF`指令将变量对应的`PyObject`关联到cell对象。  
```
        TARGET(STORE_DEREF) {
            PyObject *v = POP();
            PyObject *cell = freevars[oparg];
            PyObject *oldobj = PyCell_GET(cell);
            PyCell_SET(cell, v);
            Py_XDECREF(oldobj);
            DISPATCH();
        }
```

**闭包实现原理总结**  
到这里闭包实现的原理就理完了，总结来说：  
1. 编译期确定`co_freevars`和`co_cellvars`，用来标识变量;  
2. 外层作用域函数在执行阶段创建cell对象作为自由变量传递的载体;  
3. 闭包函数在构建阶段，接收外层函数传过来的cell对象元组，完成变量的传递;  
4. 闭包函数执行阶段，将cell对象关联到函数创建的栈帧对象中，作为函数运行环境的一部分。  

**测试用例出现的差异**  
前面测试用例的遗留问题，对于case2和case3的差异产生的原因，现在可以从闭包实现原理上做出一些解释。  
<font color=red>Q: 为什么case2引用计数不变而case3的引用计数加一？</font>  
A: case2的`comp1.cb`函数的自由变量为`'comp2'`，case3的自由变量为`'self'`，case2情况赋值`comp2`的字节码为：  

```
 27          14 LOAD_GLOBAL              2 (Component2)
             16 CALL_FUNCTION            0
             18 STORE_DEREF              0 (comp2)
```
`comp2`对应`PyObject`的引用计数增加发生在`LOAD_GLOBAL`指令对象创建阶段，`STORE_DEREF`前面已经介绍过，将cell对象的`ob_ref`设置为变量对应的`PyObject`。  
注意这里使用的宏是`PyCell_SET`不会增加`ob_ref`的引用计数。  
目前`comp2`引用计数计数只有1，后续实现闭包产生的cell对象的传递，不会增加`ob_ref`的计数的增加，只是会增加cell对象本身的计数，所以计数显示并未发生变化为2（包含调用`sys.getrefcount`的一次计数）。  

而case3的自由变量为`'self'`，也会生成对应的cell对象关联到`comp2`对应的`PyObject`，所以计数会加1。（这地方的理解可能不完整）  

<font color=red>Q: 为什么case2设置`comp2 = None`后`comp2`对应实例会回收？</font>  
A: `comp2`作为自由变量，当被重新赋值的时候，对应指令`STORE_DEREF`，如下：  

```
        TARGET(STORE_DEREF) {
            PyObject *v = POP();
            PyObject *cell = freevars[oparg];
            PyObject *oldobj = PyCell_GET(cell);
            PyCell_SET(cell, v);
            Py_XDECREF(oldobj);
            DISPATCH();
        }
```
cell对象对应的`ob_ref`被`PyCell_SET`修改，原来的关联的对象的计数也被减1，所以对象被回收掉了。  
>注：这也在提醒着自由变量在当前作用域的后续修改，是会影响闭包函数中使用到时自由变量实际的值。  

# 合理使用闭包
这里对闭包的使用稍作总结：  
1. 防止内存泄漏，对应异步回调，需要设置一个超时时间，确保callback能够及时被清除;  
2. 不要把lambda赋值给变量，lambda设定是只用一次，有需要直接写def；  
3. 不要做无意义封装，会导致`MAKE_FUNCTION`的消耗；  
4. 变量作为自由变量后，当前作用域的后续更改会作用于自由变量，cell对象会被`PyCell_SET`更改对应`ob_ref`值。  

# 结尾
这篇文章主要是总结Python3中虚拟机关于闭包的实现，关联内容为虚拟机的函数机制，断断续续写了很长时间，后续希望能够坚持写pyhton虚拟机具体实现的文章。  

本来应该还有一节来总结闭包对函数热更的影响，但是发现闭包实现的内容已经够多了，就先留个坑，后续会对热更的实现原理从虚拟机层面做一些总结。  

***

>环境：  
> python 3.7  
> [cpython 3.7](https://github.com/python/cpython/tree/3.7)  

>图片来源（侵删）：  
> [图1 f_localsplus的内存布局](https://read.douban.com/ebook/1499455/)  

>参考：  
><div id="refer-funcobj-summary-1">[1] Python源码剖析-Python虚拟机中的函数机制 </div>
