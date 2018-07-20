---
title: 抽象语法树(Abstract Syntax Tree)
date: 2018-07-20 12:15:53
tags: [ast]
---
webpack和Lint等很多工具和库的核心都是通过Abstract Syntax Tree这个概念来实现对代码的检查，分析等操作的。通过了解Abstract Syntax Tree这个概念。就可以实现自己手写类似工具。
<!-- more -->
## ast

### [esprima](http://esprima.org/)
- 解析语法   js=> 语法树
### estraverse
- 遍历树  （深度优先）=> 更改树的内容
### escodegen
- 把语法树生成新的内容 

### 栗子 改变方法名
```javascript
let esprima =require('esprima');
let estraverse = require('estraverse');
let escodegen = require('escodegen');
// 先声明一个方法
let code = `function a (){}`;
// 通过esprima生成AST

let tree =  esprima.parseScript(code);
// {
//     "type": "Program",
//     "body": [
//     {
//         "type": "FunctionDeclaration",
//         "id": {
//             "type": "Identifier",
//             "name": "a"
//         },
//         "params": [],
//         "body": {
//             "type": "BlockStatement",
//             "body": []
//         },
//         "generator": false,
//         "expression": false,
//         "async": false
//     }
// ],
//     "sourceType": "script"
// }
// 通过estraverse遍历和更新AST
// 通过enter和leave的顺序我们可以看出这是个深度优先的实现
estraverse.traverse(tree,{
    enter(node){
        if(node.type==='Identifier'){
            node.name='fly'
        }
        console.log('enter'+node.type);
    },
    leave(node){
        console.log('leave'+node.type);
    }
});
// enterProgram
// enterFunctionDeclaration
// enterIdentifier
// leaveIdentifier
// enterBlockStatement
// leaveBlockStatement
// leaveFunctionDeclaration
// leaveProgram

// 通过escodegen将AST重新生成源码
let r = escodegen.generate(tree);
console.log(r)
// function fly() {
// }

```

#### babel 插件   babel-plugin-arrow-function
```javascript
// 直接用babel实现
// babel-core 转化
// 改AST   babel-types
let babel = require('babel-core');
let types = require('babel-types');
// 生成AST
// 判断节点类型
let code = `let sum = (a,b)=>{return a=b}`;


let arrowPlugin = {
    visitor:{
        // path 是AST的路径
        ArrowFunctionExpression(path){
            let node = path.node;
            let params = node.params;
            let body = node.body;

            // 如果不是代码块
            if(!types.isBinaryExpression){
                let returnStatement = types.returnStatement;
                body=types.blockStatement([returnStatement])
            }
            // 生成一个函数表达式
            let funcs = types.functionExpression(null,params,body,false,false);
            // 重写替换
            path.replaceWith(funcs);
        }
    }
};

let r =  babel.transform(code,{
   plugins:[
       arrowPlugin
   ]
});
console.log(r.code);
```