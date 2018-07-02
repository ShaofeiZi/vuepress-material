#!/bin/bash

cd ./docs
git init
git config user.name "ShaofeiZi"
git config user.email "zishaofei221@gmail.com"
git remote add origin "https://github.com/ShaofeiZi/BLOG.git"
git fetch origin
git reset origin/master
git add .
git commit -m "更新文章成功"
git push -q origin HEAD:master
