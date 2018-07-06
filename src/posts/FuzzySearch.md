---
title: 模糊搜索
tags: [FuzzySearch,模糊搜索]
date: 2018-07-06 19:41:21
---
# 前端模糊搜索
 在一个搜索框中数据很多，或者需要做推荐的时候，根据用户输入信息自动推荐相关选项是一个很常见的需求。
<!-- more -->
## 第一版本

> 把关键字拆分，加入(.?)，如cfg最终为 (.?)(c)(.?)(f)(.?)(g)(.*?),然后拿这个正则去测试要搜索的列表，把符合要求的选项给拿出来即可

考虑到要高亮结果，我们还要生成对应的替换表达式，最后的函数如下

```javascript
var escapeRegExp = /[\-#$\^*()+\[\]{}|\\,.?\s]/g;
var KeyReg = (key) => {
    var src = ['(.*?)('];
    var ks = key.split('');
    if (ks.length) {
        while (ks.length) {
            src.push(ks.shift().replace(escapeRegExp, '\\$&'), ')(.*?)(');
        }
        src.pop();
    }
    src.push(')(.*?)');
    src = src.join('');
    var reg = new RegExp(src, 'i');
    var replacer = [];
    var start = key.length;
    var begin = 1;
    while (start > 0) {
        start--;
        replacer.push('$', begin, '($', begin + 1, ')');
        begin += 2;
    }
    replacer.push('$', begin);

    info = {
        regexp: reg,
        replacement: replacer.join('')
    };
    return info;
};

```
调用 **KeyReg**把关键字传入，拿返回值的**regexp**去检测搜索的列表，把符合的保存下来即可。

到目前为止我们只实现了搜索功能，按更优的体验来讲，在搜索结果中，要优先把相连匹配的放在首位，

要完成这个功能，我们使用**KeyReg**返回值中的**replacement**，用它进行检测，把结果中长度最长的放前面即可。

# 第二版本

```javascript
let Searcher = (() => {
    let escapeRegExp = /[\-#$\^*()+\[\]{}|\\,.?\s]/g;
    let escapeReg = reg => reg.replace(escapeRegExp, '\\$&');
    //groupLeft 与 groupRight是对结果进一步处理所使用的分割符，可以修改
    let groupLeft = '(',
        groupRight = ')';
    let groupReg = new RegExp(escapeReg(groupRight + groupLeft), 'g');
    let groupExtractReg = new RegExp('(' + escapeReg(groupLeft) + '[\\s\\S]+?' + escapeReg(groupRight) + ')', 'g');
    //从str中找到最大的匹配长度
    let findMax = (str, keyword) => {
        let max = 0;
        keyword = groupLeft + keyword + groupRight;
        str.replace(groupExtractReg, m => {
            //keyword完整的出现在str中，则优秀级最高，排前面
            if (keyword == m) {
                max = Number.MAX_SAFE_INTEGER;
            } else if (m.length > max) {//找最大长度
                max = m.length;
            }
        });
        return max;
    };
    let keyReg = key => {
        let src = ['(.*?)('];
        let ks = key.split('');
        if (ks.length) {
            while (ks.length) {
                src.push(escapeReg(ks.shift()), ')(.*?)(');
            }
            src.pop();
        }
        src.push(')(.*?)');
        src = src.join('');
        let reg = new RegExp(src, 'i');
        let replacer = [];
        let start = key.length;
        let begin = 1;
        while (start > 0) {
            start--;
            replacer.push('$', begin, groupLeft + '$', begin + 1, groupRight);
            begin += 2;
        }
        replacer.push('$', begin);

        info = {
            regexp: reg,
            replacement: replacer.join('')
        };
        return info;
    };

    return {
        search(list, keyword) {
            //生成搜索正则
            let kr = keyReg(userInput);
            let result = [];
            for (let e of list) {
                //如果匹配
                if (kr.regexp.test(e)) {
                    //把结果放入result数组中
                    result.push(e.replace(kr.regexp, kr.replacement)
                        .replace(groupReg, ''));
                }
            }
            //对搜索结果进行排序
            //1. 匹配关键字大小写一致的优先级最高，比如搜索up, 结果中的[user-page,beginUpdate,update,endUpdate]，update要排在最前面，因为大小写匹配
            //2. 匹配关键字长的排在前面
            result = result.sort((a, b) => findMax(b, keyword) - findMax(a, keyword));
            return result;
        }
    };
})();

//假设list是待搜索的列表
let list = ['config', 'user-page', 'bind', 'render', 'beginUpdate', 'update', 'endUpdate'];
//假设userInput是用户输入的关键字
let userInput = 'up';

//获取搜索的结果
console.log(Searcher.search(list, userInput));
// ["(up)date", "begin(Up)date", "end(Up)date", "(u)ser-(p)age"]
```

对搜索结果中的内容做进一步处理渲染出来即可，比如把 `(` 替换成 `<span style="color:red">` 把 `)` 替换成`</span>`显示到页面上就完成了高亮显示