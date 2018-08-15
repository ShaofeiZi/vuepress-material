---
title: node模块
date: 2018-08-15 19:15:53
tags: [CommonJs,node]
---
# node的模块化
首先 假设 大家对 AMD CMD CommonJs 模块都有一定的了解 、
然后 我再说一下node用的CommonJs 
nodeJS的根基就是ES  ES6之前 本身是没有模块机制的
所以出现了 CommonJs 
<!-- more -->
## CommonJs
 CommonJs 主要遵循三个约定
- require
- 模块上下文
- 模块标志
其他都是 次要的
### require
require本身就是一个函数 带一个参数  参数其实就是模块名（严谨点叫模块标志）返回值 是模块暴露的API
举个例子
```javascript
const blahblah = require("boom_shakalaka");
```
这样就能引用到这个模块中的暴露的东东
### 模块上下文
在一个CommonJs的上下文中需要满足下面这些条件有这些条件存在  
- require 
- exports  （连接异界的神魔之井）
- module （挂着自带的属性  比如 ID exports）
module.exports的初始对象指向exports
```
module.exports=XXXXXX
```
然后module.exports就不等于exports了
![](/images/nodeModels/_1533119230_1606572170.png)
三者 和外部模块的关系
### 模块标志 
通俗的讲  就是个模块名  
模块标识其实就是一个字符串，用于传给 require 函数的。
它需要是小驼峰格式的标识名，或者以 "." 以及 ".." 带头的相对路径。理论上来说不应该带上后缀名，如 ".js"。

(官网说)[www.commonjs.org]  
```
Module Identifiers
A module identifier is a String of "terms" delimited by forward slashes.
A term must be a camelCase identifier, ".", or "..".
Module identifiers may not have file-name extensions like ".js".
Module identifiers may be "relative" or "top-level". A module identifier is "relative" if the first term is "." or "..".
Top-level identifiers are resolved off the conceptual module name space root.
Relative identifiers are resolved relative to the identifier of the module in which "require" is written and called.
```

实际在用的时候 好多人都不遵循规范
比如好多-cli。。。但是不符合标志啊

满足上面三个约定的 基本就可以认为是一个模块  
还有两个隐藏约定 
不遵守 也可以ok 比如自己写的时候
- 存储方案；
- 加载器可以支持环境变量寻径，也可以不支持。
### 存储方案；
模块内容存在数据库 文件 函数 链接库  都OK  比如node 就直接放文件系统   node_modules  
C++模块是用动态链接的  跳过
### 加载器
设置一个path变量  然后通过path来查找  这个可以不实现  看心情   CommonJs管不到。。
再举个栗子


![a](/images/nodeModels/_a_1533121025_305852556.png)


完成


## node的模块 
```
node index.js
```
index.js 就是入口文件  
入口之后 都是一个一个模块组成 大部分是CommonJs规范  还有一些`.node`的文件 这些就是C++模块文件
有啥好处呢
配合npm2.X版本 是嵌套类型能精准控制依赖版本
3.0 扁平化依赖  为了控制体积
对于后端和CLI 更适合npm2.。

### 寻找路径
之前说过  node中可以使用以 "." 以及 ".." 带头的相对路径
在node在 大小写随便用其实也是可以的  
比如 https://gitlab.renrenche.com/fe/swagger-axios
1. Node.js 核心模块
2. 文件模块
  1. 三方模块
  2. 项目模块
#### (核心模块)[https://github.com/nodejs/node/tree/v6.9.4/lib]

迭代有点快  放了个老的LTS版本

这些模块编译后会放到node的可执行文件中
而且 每一个文件都有一个预留标志  
自己写的  最好不要重名
不然只会返回核心模块的
#### 文件模块
通过路径的方式引入的模块
##### 三方模块
找到的是目录的话  会依次寻找  index.js  index.json index.node  然后返回
##### 项目模块
```
比如一个 JavaScript 文件路径是 /Users/biu/index.js，那么在 require("/Users/biu") 的时候，该 JavaScript 文件会被加载。
```
如果package.json 的main字段指向的是  biu.js  会直接找到biu.js  而不会例会index.js

![](/images/nodeModels/_1533122207_1535541421.png)

```
// a_program.js

const Biu = require("biu");
// package.json 的部分源码
```

```
{
  ...,
  "main": "biu.js",
  ...
}
```

##### 再说三方模块
 传进去的标志 是`/` ,`./`,`../`这种 通常是依赖包的形式存在的   
 node 不仅仅会在当前目录寻找
1. 当前文件目录的 node_modules 目录下；
2. 若 1 没有符合的模块，则去当前文件目录的父目录的 node_modules 下；
3. 若没有符合的模块，则再往上一层目录的 node_modules；
4. 若没有符合的模块，重复 3 直到寻找到符合的模块或者根目录为止。

其它的标识不是以 `/` ,`./`,`../`带头的模块被称为三方模块，这些模块通常以 Node.js 依赖包形式存在。


##### 模块缓存

node会缓存第一次加载的代码 第二次的时候 会直接返回缓存
```
// dog.js

"use strict";

let boom = "嘘，蛋花汤";
boom += "在睡觉。OOO";

module.exports = {
  "OOO": boom
};
```

```
// entry.js

"use strict";

let ლ_ಠ益ಠ_ლ = require("./dog");

console.log(ლ_ಠ益ಠ_ლ);

let 蛋花汤 = require("./dog");

console.log(蛋花汤);
```

```
$ node entry.js
{ 'OOO': '嘘，蛋花汤在睡觉。OOO' }
{ 'OOO': '嘘，蛋花汤在睡觉。OOO' }
```
### node包
#### 包描述文件
package.json
##### 必填
![](/images/nodeModels/_1533123592_1533676748.png)

##### 选填
![](/images/nodeModels/_1533123608_258888695.png)

保留字段有：build，default，email，external，files，imports，maintainer，paths，platform，require，summary，test，using，downloads，uid，type。
其他可以写 但是会被包管理器忽略

node模块包描述引用的CommonJs的包描述

来个栗子CommonJs
![](/images/nodeModels/_1533123722_677683093.png)

node包描述

![](/images/nodeModels/_1533123692_340428043.png)

具体可以看https://docs.npmjs.com/files/package.json

npm2 是嵌套的  npm3是扁平的  
举个栗子
举个例子，我们的项目有一个依赖包 bar 的 1.0.0 版本依赖另一个包 foo 的 ^1.0.0 版本，而我们项目的另一个依赖包 baz 的 1.0.0 版本依赖了 foo 的 ^1.1.0 版本
npm2
```
└── node_modules
    ├── bar
    │   └── node_modules
    │       └── foo
    └── baz
        └── node_modules
            └── foo
```

```
如果 bar 的开发者觉得 foo 中有一个函数无法满足自己的需求，那么也许它会有这么一段代码：

const foo = require("foo");

const old = foo.func;
foo.func = function() {
    // do some hack
    // 做一些注入式的代码，使其满足自己的要求
    // 但这段代码可能会引起其它使用该包的依赖
    // 造成破坏
};
```

在npm2 中 是两份不同的缓存  不会有问题
npm3+  就不知道会造成什么后果了 扁平化  适合面向体积优化  带来危险不可预知
```
└── node_modules
    ├── bar
    └── foo
    └── baz
```
依赖爆炸。 对于想要开发node的来说  是个灾难。。
##### 循环引用
假如一不小心，a 引用 b，b 又引用了 a 这种
a和b都加载完成了
那是没什么问题的  因为加载的时候 都已经加载完成了 
如果没有加载完成 a没加载完  加载b  OK   这个时候b又去加载a  炸了。。
如果只是单独一个函数  
那就用到的时候再去加载 
```
// a.js
const b = require("b");

// 做一些事情...
```
```
// b.js
exports.test = function() {
    const a = require("a");
};
```

### cnpm
和npm的工作原理不一样 会将包缓存到node_modules\npminstall这个目录下 然后再以软连接的形式（windows上是快捷方式）链接到项目目录。
这样会导致一个问题。所有的包都只有一份实体。
因为缓存是根据路径缓存的。然后拿的路径是软连接。所以每次拿的缓存是单独的，

cnpm4.2和4.3的区别和npm2与npm3项目目录很像。
但是为了服务后端服务人员。是先按照npm2的方法存放一份包。然后再把相关依赖按照npm3的方法再放一份包。
这样解决了前端开发人员和后端开发人员 对不同包管理器的依赖喜好

## node 模块加载原理
nodejs载入一个模块或者C++扩展是依赖require来加载的 （ES6的先不管）
先说一下[nodejs的入口](https://github.com/nodejs/node/blob/v6.9.4/src/node_main.cc)
```
// src/node_main.cc
int main(int argc, char *argv[]) {
  // Disable stdio buffering, it interacts poorly with printf()
  // calls elsewhere in the program (e.g., any logging from V8.)
  setvbuf(stdout, nullptr, _IONBF, 0);
  setvbuf(stderr, nullptr, _IONBF, 0);
  // 直接进入node命名空间，然后调用start函数
  return node::Start(argc, argv);
}
```
然后门去node里[看一下](https://github.com/nodejs/node/blob/v6.9.4/src/node.cc#L3470)
```

// Execute the lib/internal/bootstrap_node.js file which was included as a
// static C string in node_natives.h by node_js2c.
// 'internal_bootstrap_node_native' is the string containing that source code.
// 进入之后启动bootstrap_node  进行初始化
Local<String> script_name = FIXED_ONE_BYTE_STRING(env->isolate(),
                                                "bootstrap_node.js");
Local<Value> f_value = ExecuteString(env, MainSource(env), script_name);

...

Local<Function> f = Local<Function>::Cast(f_value);

...

f->Call(Null(env->isolate()), 1, &arg);
```

bootstrap_node.js其实是一个大闭包的函数
在上面那段代码会把process对象给注入进去[](https://github.com/nodejs/node/blob/v6.9.4/lib/internal/bootstrap_node.js)
```
(function(process) {
...

})
```

![](/images/nodeModels/_1533262790_1843766525.png)
大概的一个启动流程。。
在node中其实是有四类模块
- C++核心
- node内置
- 用户源码
- C++扩展

之前讲的时候C++核心 和 node内置 都是node和核心模块 用户源码和C++扩展都是属于文件模块

node 是原生模块 
先介绍下Binding函数  
[对应的是](https://github.com/nodejs/node/blob/v6.9.4/src/node.cc#L2609)
```
其中 Local<String> module = args[0]->ToString(env->isolate()); 和 node::Utf8Value module_v(env->isolate(), module); 两句代码意味着从参数中获得文件标识（或者也可以认为是文件名）的字符串并赋值给 module_v。
```
```
在得到标识字符串之后，Node.js 将通过 node_module* mod = get_builtin_module(*module_v); 这段代码获取 C++ 核心模块，例如未经源码 lib 目录下的 JavaScript 文件封装的 file 模块。我们注意到这里获取核心模块用的是一个叫 get_builtin_module 函数，这个函数内部做的工作就是在一条叫 modlist_builtin 的 C++ 核心模块链表上进行对比文件标识，从而返回相应的模块。
```
```
追根溯源，这些 C++ 核心模块则是在 node_module_register 函数中被逐一注册进链表里面的。
```
[node_module_register](https://github.com/nodejs/node/blob/v6.9.4/src/node.cc#L2378-L2405)

```c
extern "C" void node_module_register(void* m) {
  struct node_module* mp = reinterpret_cast<struct node_module*>(m);

  if (mp->nm_flags & NM_F_BUILTIN) {
    mp->nm_link = modlist_builtin;
    modlist_builtin = mp;
  } else if (!node_is_initialized) {
    // "Linked" modules are included as part of the node project.
    // Like builtins they are registered *before* node::Init runs.
    //“链接”模块作为节点项目的一部分包含在内。
    //与内置类似，它们在* node :: Init运行之前注册*。
    mp->nm_flags = NM_F_LINKED;
    mp->nm_link = modlist_linked;
    modlist_linked = mp;
  } else {
    modpending = mp;
  }
}

struct node_module* get_builtin_module(const char* name) {
  struct node_module* mp;

  for (mp = modlist_builtin; mp != nullptr; mp = mp->nm_link) {
    if (strcmp(mp->nm_modname, name) == 0)
      break;
  }

  CHECK(mp == nullptr || (mp->nm_flags & NM_F_BUILTIN) != 0);
  return (mp);
}

```
[注册核心模块的宏](https://github.com/nodejs/node/blob/v6.9.4/src/node.h#L458-L484)  

```c
#define NODE_MODULE_CONTEXT_AWARE_X(modname, regfunc, priv, flags)    \
  extern "C" {                                                        \
    static node::node_module _module =                                \
    {                                                                 \
      NODE_MODULE_VERSION,                                            \
      flags,                                                          \
      NULL,                                                           \
      __FILE__,                                                       \
      NULL,                                                           \
      (node::addon_context_register_func) (regfunc),                  \
      NODE_STRINGIFY(modname),                                        \
      priv,                                                           \
      NULL                                                            \
    };                                                                \
    NODE_C_CTOR(_register_ ## modname) {                              \
      node_module_register(&_module);                                 \
    }                                                                 \
  }

#define NODE_MODULE(modname, regfunc)                                 \
  NODE_MODULE_X(modname, regfunc, NULL, 0)

#define NODE_MODULE_CONTEXT_AWARE(modname, regfunc)                   \
  NODE_MODULE_CONTEXT_AWARE_X(modname, regfunc, NULL, 0)

#define NODE_MODULE_CONTEXT_AWARE_BUILTIN(modname, regfunc)           \
  NODE_MODULE_CONTEXT_AWARE_X(modname, regfunc, NULL, NM_F_BUILTIN)   \
```

关键的宏：`NODE_MODULE_CONTEXT_AWARE_BUILTIN` 注册进核心模块
[node_file.cc](https://github.com/nodejs/node/blob/v6.9.4/src/node_file.cc#L1511)
 // node_file.cc 最后一行
 
```c
NODE_MODULE_CONTEXT_AWARE_BUILTIN(fs, node::InitFs)
```

也就是说，基本上在每个 C++ 核心模块的源码末尾都有有一个宏调用将该模块注册进 C++ 核心模块的链表当中去，以供 process.binding 进行获取。

有兴趣的  可以研究下  没兴趣的可以略过

### nodejs 内置模块
FS HTTP 等、基本等同于API  是放在lib目录下的那些  基本是对核心模块的一个高级封装
如 ·`lib/crypto.js `中就有一段 `const binding = process.binding("crypto"); `这样的代码，它的很多内容都是基于 C++ 核心模块中的 crypto 进行实现的。
js文件也是编译到可执行文件的  

![](/images/nodeModels/_1533269278_2142443112.png)

内置模块的相关处理  
如果是native_module  那就返回那个类
不然就进入 compile  进行编译  
看到第一行 获取这个模块的源码 
直接返回_source[id]
这个其实是直接返回bing
```c
...

} else if (!strcmp(*module_v, "natives")) {
  exports = Object::New(env->isolate());
  DefineJavaScript(env, exports);
  cache->Set(module, exports);
} else {

...
```
然后再看下[DefineJavaScript]( https://github.com/nodejs/node/blob/v6.9.4/src/node_javascript.cc#L23-L36 )

```c
void DefineJavaScript(Environment* env, Local<Object> target) {
  HandleScope scope(env->isolate());

  for (auto native : natives) {
    if (native.source != internal_bootstrap_node_native) {
      Local<String> name = String::NewFromUtf8(env->isolate(), native.name);
      Local<String> source =
          String::NewFromUtf8(
              env->isolate(), reinterpret_cast<const char*>(native.source),
              NewStringType::kNormal, native.source_len).ToLocalChecked();
      target->Set(name, source);
    }
  }
}
```
大概返回结果就是这样的
```
{ fs: "fs 的源码", http: "http 的源码" }
```
native这个变量并没有在这里  
可以看一下node-gyp的配置文件   然后有个node_js2c  在这一步里面做的事情就是用 Python 去调用一个叫 tools/js2c.py 的文件。而这个 js2c.py 就是问题的关键所在了
[js2c](https://github.com/nodejs/node/blob/v6.9.4/tools/js2c.py)
这个文件会生成 src/node_natives.h 这个头文件 然后就存在了
![](/images/nodeModels/_1533279346_1183074135.png)

大概是这样
把传说中编译进 Node.js 二进制文件的 JavaScript 代码的神秘面纱揭开以后，我们现在回到 NativeModule.compile 函数中来。它会在刚获取到的内置模块 JavaScript 源码字符串前后用 (function (exports, require, module, __filename, __dirname) { 和 }); 进行包裹，形成一段闭包代码，然后将其放入 vm6 （安全沙箱）中运行，并传入事先准备好的 module 和 exports 对象供其导出。
```javascript
// a.js
let a = { foo: 1 };
function test() {
}

exports.a = a;
exports.test = test;
```

```javascript
// 编译后
(function (exports, require, module, __filename, __dirname) {
let a = { foo: 1 };
function test() {
}

exports.a = a;
exports.test = test;
});
```

```c
// compile 执行
// this 就是 NativeModule 类实例化出来的一个对象
fn = 刚才编译后得到的闭包函数;
fn(this.exports， NativeModule.require, this, this.filename);
```

大概的一个包的require的过程

:::tip
这里的Module是NativeModule 我们自己写的是另一个module 只不过共用了一个闭包的源码。
:::
举个例子  写个a.js
然后console.log(Module)
```javascript
Module {
  id: '.',
  exports: {},
  parent: null,
  filename: '/private/tmp/temp/a.js',
  loaded: false,
  children: [],
  paths:
   [ '/private/tmp/temp/node_modules',
     '/private/tmp/node_modules',
     '/private/node_modules',
     '/node_modules' ] }
```
可以看出来 exports 只是其中一小部分
但是这部分是我们用的最多的

### 用户源码模块 
非node源码模块的js模块
运行时 按照需求  加载进来的
每个模块也会被加上这个闭包的头尾
具体的实现可以看[module](https://github.com/nodejs/node/blob/v6.9.4/lib/module.js#L37)
我们平时用的require就是这个模块中的require函数
module类的实例对象  就是用户源码模块的真正本体。在VM运行的结果 就是核心
我们平时写的module.exports就是这个的一个实例对象。
module就是这个类 实例化之后的对象
当我们写 `module.exports = foo` 的时候就是给这个 module 对象的 exports 变量重新赋了个值。

看下require函数吧 直接去调用module._load

然后表示不是入口模块
![](/images/nodeModels/_1533280856_375899372.png)
![](/images/nodeModels/_1533280928_1991339377.png)

整体流程是
![](/images/nodeModels/_1533280961_2055754391.png)
加载模块我们省略了 因为他是调用 trymoduleload来执行的  其实就是loan函数加了错误处理
根据不同文件名选择不同加载方式
```c
Module.prototype.load = function(filename) {
  this.filename = filename;
  this.paths = Module._nodeModulePaths(path.dirname(filename));

  var extension = path.extname(filename) || '.js';
  if (!Module._extensions[extension]) extension = '.js';
  Module._extensions[extension](this, filename);
  this.loaded = true;
};
```

说一下JS的吧 


Module._extensions[".js"] 这种规则做的事情分两步：

1. 同步读取源码（filename）的内容，使用 fs.readFileSync；
2. 调用 module._compile() 函数编译源码并执行。

![](/images/nodeModels/_1533281181_199652954.png)

这个函数也是生成闭包代码 然后执行  

![](/images/nodeModels/_1533281211_1197741264.png)

一个模块的源码 经过编译之后 就形成了 携带`expotr`、`require`,`filename`,`dirname`的一个函数了  这就是我们平时能直接用这些东西的原因了

node加载  window类似dll  linux 类似动态链接库

![](/images/nodeModels/_1533283596_2073200717.png)

最后我再给大家一个小技巧，改造 `require()` 函数的规则，比如大家的项目目录下有个 `lib/test/a.js` 文件，然后可以让大家在项目的任意文件中直接通过 `require("lib/test/a")` 就能获取这个模块，而不用去自行计算相对路径值绕来绕去



