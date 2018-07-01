#!/bin/bash

cd ./docs
git init
git config user.name "ShaofeiZi"
git config user.email "zishaofei221@gmail.com"
git remote add upstream "https://github.com/ShaofeiZi/BLOG.git"
git fetch upstream
git reset upstream/gh-pages
touch .
git add -A .
git commit -m "更新文章成功"
git push -q upstream HEAD:gh-pages
