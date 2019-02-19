/*
 * @Description: 文件
 * @version: 1.0.0
 * @Company: 袋鼠云
 * @Author: xiuneng
 * @Date: 2019-01-07 17:06:53
 * @LastEditors: xiuneng
 * @LastEditTime: 2019-01-08 16:49:48
 */


const Colors = require('colors');
const Log = console.log;
const fs = require('fs');
const { resolveApp, parsePath } = require('../config/defaultPaths');
const { get } = require('../util/request');
const { existsSync, mkdir } = require('../util/fileService');
const Mustache = require('mustache');
const Path = require('path');
const DEFAULT_FILE_NAME = 'restfulApi.js';
/**
 * @description 对象数组去重
 * @param {Array} arr 
 */
const unique = (arr = []) => {
    let obj = {};
    let result = arr.reduce((item, next) => {
        obj[next.operationId] ? '' : obj[next.operationId] = true && item.push(next);
        return item;
    }, []);
    return result;
}
/**
 * 
 * @param {string} url -url地址
 */
const getSwaggerPath = (url = '') => {
    return new Promise((resolve, reject) => {
        get({}, url).then((res) => {
            resolve(res[0].location);
        }).catch((err) => {
            reject(err);
        });
    })
}
/**
 * @description 用于合并两个数组对象
 * @param {Array} arr1 
 * @param {Array} arr2 
 */
const handleResolveArray = (arr1, arr2) => {
    arr2 = arr2.map((item) => {
        //合并data数据
        let index = item.name + ' ' + item.description;
        let object = arr1.find(o => o.name == index) || {};
        item.data = item.data.concat(object.data || []);
        return item;
    })
    //去重
    arr2 = arr2.map((item) => {
        item.data = unique(item.data);
        return item;
    })
    return arr2;
}
/**
 * @description 反向解析字符串
 * @param {string} str 
 */
const parseRenderString = (str) => {
    let parseArr = str.trim().split('\n').filter(o => o.trim() != '{' && o.trim() != '}' && o.trim());
    let result = [];
    let obj = {};
    parseArr.forEach((item) => {
        if (/(?<=(= ))[^(=),]*/.test(item)) {
            result.push(obj);
            obj = {};
            // obj.name = item.trim().slice(8, item.length - 12);
            obj.name = item.match(/(?<=(= ))[^(=),]*/)[0].trim();
            obj.description = '';
            obj.data = [];
        } else {
            try {
                let method = /(?<=method: \')[^\',]*/.test(item) ? item.match(/(?<=method: \')[^\',]*/)[0].trim() : '';
                let url = /(?<=url: (\`|\'|\"))[^(\`|\'|\"),]*/.test(item) ? item.match(/(?<=url: (\`|\'|\"))[^(\`|\'|\"),]*/)[0].trim() : '';
                let key = /[^:\`,]*/.test(item) ? item.match(/[^:\`,]*/)[0].trim() : '';
                let note = /(?<=\/\/)[^]*/.test(item) ? item.match(/(?<=\/\/)[^]*/)[0].trim() : '';
                Array.isArray(obj.data) && obj.data.push({
                    path: url,
                    operationId: key,
                    summary: note,
                    method,
                });
            } catch (err) {
                Log(`${item}失败:`, err)
            }
        }
    })
    return result.filter(o => JSON.stringify(o) != '{}');
}
/**
 * @param {string} path-swagger地址
 * @param {string} filePath-生成的api接口文件地址
 */
module.exports = (path, filePath) => {
    let parseUrl = parsePath(path);
    getSwaggerPath(`${parseUrl.protocol}//${parseUrl.host}/swagger-resources`)
        .then((res) => {
            return `${parseUrl.protocol}//${parseUrl.host}${res}`
        }).then(api => {
            get({}, api).then((res) => {
                let result = [];
                res.tags.map((item) => {
                    result.push({ name: item.name, description: item.description, data: [] });
                })
                Object.keys(res.paths).map((reqApi) => {
                    const method = Object.keys(res.paths[reqApi])[0];
                    const info = res.paths[reqApi][method];
                    let object = result.find(o => o.name == info.tags[0]);
                    object.data.push({ ...info, path: reqApi, method, });
                })
                let temp = fs.readFileSync(resolveApp('./template/restfulTemplate.mustache'), "utf-8").toString();
                let renderString = Mustache.render(temp, { result: result });
                const folderExist = existsSync(filePath); //文件夹是否存在
                if (folderExist) {
                    const fileExist = existsSync(Path.join(filePath, DEFAULT_FILE_NAME));
                    if (fileExist) {
                        //若文件存在,则读取内容
                        const fileContent = fs.readFileSync(Path.join(filePath, DEFAULT_FILE_NAME)).toString();
                        let fileResult = parseRenderString(fileContent.match(/\{((?:[^{}]*\{[^{}]*\})*[^{}]*?)\}/)[0]);
                        result = handleResolveArray(fileResult, result);
                        renderString = Mustache.render(temp, { result: result });
                        fileResult = fileContent.replace(/\{((?:[^{}]*\{[^{}]*\})*[^{}]*?)\}/, renderString.match(/\{((?:[^{}]*\{[^{}]*\})*[^{}]*?)\}/)[0]);
                        fs.writeFile(Path.join(filePath, DEFAULT_FILE_NAME), fileResult, function (err) {
                            if (err) Log(Colors.red('生成api文件操作失败'));
                            else Log(Colors.green('生成api文件操作成功'));
                        })
                    } else {
                        //文件夹存在,但文件不存在
                        fs.writeFile(Path.join(filePath, DEFAULT_FILE_NAME), renderString, function (err) {
                            if (err) Log(Colors.red('生成api文件操作失败'));
                            else Log(Colors.green('生成api文件操作成功'));
                        })
                    }
                } else {
                    //文件夹不存在,则文件必不存在;
                    try {
                        mkdir(filePath);
                        fs.writeFile(Path.join(filePath, DEFAULT_FILE_NAME), renderString, function (err) {
                            if (err) Log(Colors.red('生成api文件操作失败'));
                            else Log(Colors.green('生成api文件操作成功'));
                        })
                    } catch (err) {
                        Log(Colors.red(`请检查文件路径 ${filePath} 是否合法`));
                    }
                }
            })
        }).catch(err => {
            Log(Colors.red('请检查Swagger地址是否合法'));
        })
}

