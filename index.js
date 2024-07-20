import express from 'express'
import iconvLite from 'iconv-lite'
import cors from 'cors'
import https from 'https'
import axios from './axios.js'
import sharp from 'sharp'
import sqlite3 from 'sqlite3'

const app = express()
app.use(cors())
const db = new sqlite3.Database("Data.db")
let is = true
let lastResList = {}
const http = "https://banzhu99999.com"
const dbRun = (table, method, code, data) => {
  let Sqr
  switch (method) {
    case 'run': Sqr = `INSERT INTO ${table} VALUES(${code})`
      break
    case 'get': Sqr = `SELECT ${data} FROM ${table} WHERE ${code}`
      break
    case 'all': Sqr = `SELECT ${data} FROM ${table}  ${code}`
      break
    default:
  }
  // console.log(Sqr)
  return new Promise((resolve) => {
    db?.[method](Sqr, (err, result) => {
      // console.log(err)
      resolve(result)
    })
  })

}
const encode = ((str, charset) => {
  let buf = iconvLite.encode(str, charset)
  let encodeStr = ''
  let ch = ''
  for (let i = 0; i < buf.length; i++) {
    ch = buf[i].toString('16')
    if (ch.length === 1) {
      ch = '0' + ch
    }
    encodeStr += '%' + ch
  }
  encodeStr = encodeStr.toUpperCase()
  return encodeStr
})
const fetchHttp = async (data) => {
  is = false
  console.log(data)
  const res = await fetch(http + "/s.php", {
    method: "POST",
    body: data,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      'User-Agent': 'Mozilla/5.0 (iPhone CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/126.0.0.0'
    },
  })
  const buffer = await res.arrayBuffer()
  const decoder = new TextDecoder("gbk")
  const text = decoder.decode(buffer)
  is = true
  console.log(is)
  if (text.length > 10) {
    console.log('!!!!!!!!!!' + data + '   True')
    lastResList[data] = text
  }
  return text
}
const fetchGet = async (id, isText = true) => {
  let headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/126.0.0.0',
  }
  const url = http + id
  console.log('fetchGet' + id)
  const res_1 = await fetch(url, {
    method: "GET",
    headers: headers
  })
  const clonedRes = res_1.clone()
  const buffer = await res_1.arrayBuffer()
  const decoder = new TextDecoder("gbk")
  const text = decoder.decode(buffer)
  if (text.length > 10) {
    if (isText) {
      console.log('!!!!!!!!!!' + id + '  True')
      lastResList[id] = text
    }
  }
  return text
}
const lastStr = (key, res) => {
  console.log('!!!!!!!!!!!!lastStr')
  res.send(lastResList[key])
  return false
}
app.get('/Search', ({ query }, res) => {
  let { key, page } = query
  key = encode(key, 'gbk')
  const data = "objectType=2&type=articlename&s=" + key + "&page=" + page
  if (lastResList[data]) return lastStr(data, res)
  if (is) {
    let result = fetchHttp(data)
    result.then(data => {
      res.send(data)
    })
  }
})
app.get('/next', ({ query }, res) => {
  let id = query.id
  if (lastResList[id]) return lastStr(id, res)
  console.log(id)
  fetchGet(id, res)
    .then(data => {
      res.send(data)
    })
})
app.get('/text', async ({ query }, res) => {
  let { id, name } = query
  let path = ''
  let rep = id.replace(/\/([^\/]+)\.html/g, (_, item) => {
    path = item
    return '/'
  })
  let url = rep + path + '_'
  let dbData = await dbRun('pathRes', 'all', ['WHERE parent_id=' + path], 'resData')
  if (dbData.length) {
    let text
    if (dbData.length !== 1) {
      let is = true
      let errList = []
      for (let i = 0; i < dbData.length; i++) {
        let resData = dbData[i].resData
        if (resData) {
          resData = iconvLite.decode(resData, 'gbk')
          text += resData
        }
        else {
          is = false
          await axios(`${url + (i + 1) + '.html'}`)
            .then(buffer => {
              if (buffer) {
                buffer = iconvLite.decode(buffer, 'gbk')
                text += buffer
                is = true
              }
            })
            .catch(err => { console.log(err) })
        }
      }
      if (is) {
        // text = iconvLite.encode(text, 'gbk')
        const stmt = db.prepare("INSERT OR REPLACE INTO pathRes VALUES (?,?,?)")
        stmt.run(path, 'all', text)
        stmt.finalize()
        db.run(`UPDATE resText SET nameTrue = 1 WHERE path = ${path}`)
        console.log(name + '全部请求完成')
      }
      else {
        console.log(name + '请求不全')
      }
    }
    else {
      text = iconvLite.decode(dbData[0].resData, 'gbk')
    }
    res.send(text)
    return false
  }
  console.log("第一次加载")
  dbRun('resText', 'run', [path, `"${name}"`, 0])
  axios(id)
    .then(buffer => {
      let text = iconvLite.decode(buffer, 'gbk')
      if (text) {
        let length = text.split(path + '_').length - 1
        if (length == 1) {
          res.send(text)
          dbRun('pathRes', 'run', [path, path, `'${buffer}'`])
          return false
        }
        let is = true
        let all = []
        for (let i = 2; i <= length; i++) {
          all.push(axios(`${url + i + '.html'}`))
        }
        Promise.allSettled(all)
          .then(arr => {
            const stmt = db.prepare("INSERT OR REPLACE INTO pathRes VALUES (?,?,?)")
            let errList = []
            for (let i = 0; i < arr.length; i++) {
              let index = path + '_' + (i + 2)
              if (arr[i].value) {
                let data = iconvLite.decode(arr[i].value, 'gbk')
                text += data
              }
              else {
                errList[i] = index
                is = false
              }
            }
            if (is) {
              res.send(text)
              text = iconvLite.encode(text, 'gbk')
              stmt.run(path, 'all', text)
              stmt.finalize()
              db.run(`UPDATE resText SET nameTrue = 1 WHERE path = ${path}`)
              console.log(name + '全部请求完成')
            }
            else {
              stmt.run(path, path, buffer)
              arr.forEach((item, index => {
                stmt.run(path, index, item.value)
              }))
              stmt.finalize()
              console.log(errList + '请求不全')
            }
          })
          .catch(err => { console.log(err) })
      }
      else {
        res.send('第一页请求失败')
      }
    })
    .catch(err => {
      console.log(err)
    })
})
app.get('/openid', async ({ query }, res) => {
  let id = query.id
  let dbData = await dbRun('ocrList', 'get', ['ocrId=' + id], 'ocrName')
  console.log(id)
  if (dbData) {
    res.send({
      code: '200',
      data: { [id]: `${dbData.ocrName}` }
    })
    return false
  }
  let option = {
    hostname: 'banzhu99999.com',
    path: `/toimg/data/${id}.png`,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/126.0.0.0',
    }
  }
  https.get(option, (req) => {
    let imgData = ''
    req.setEncoding('binary')
    req.on('data', function (chunk) {
      imgData += chunk
    })
    req.on("end", function () {
      const buffer = Buffer.from(imgData, 'binary')
      const run = async function () {
        const background = sharp({
          create: {
            height: 300, width: 300, channels: 4, background: 'white'
          }
        })
          .png()
        let base64 = await background.composite([{ input: buffer, blend: 'atop', left: 150, top: 150 }])
          .toBuffer()
          .then(data => {
            return data.toString("base64")
          })
        const url = 'http://127.0.0.1:1224/api/ocr'
        const data = {
          base64,
          // 可选参数示例
          "options": {
            "data.format": "text",
          }
        }
        fetch(url, {
          method: "POST", body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
        })
          .then(response => response.json())
          .then(({ data }) => {
            data = data.replace(/\s/g, '')
            if (data == 'Notextfoundinimage.Path:"base64"') {
              console.log(id, data)
              background.composite([{ input: buffer, blend: 'atop', left: 150, top: 150 }])
                .toFile(`./${id}.png`)
              data = false
            }
            else {
              dbRun('ocrList', 'run', [id, data])
            }
            console.log(id, '!!!!!!!!!!!' + data)
            res.send({
              code: '200',
              data: { [id]: data }
            })
          })
          .catch(error => {
            console.error(error)
          })
      }
      run()
    })
  })
})
app.get('/html', async ({ query }, res) => {
  let dbData = await dbRun('resText', 'all', [], '*')
  res.send(dbData)
})
app.listen(3000, function () {
  console.log('server start: http://127.0.0.1:3000')
})
