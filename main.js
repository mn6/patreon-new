require('dotenv').config()
const request = require('superagent')
const url = encodeURI(`https://www.patreon.com/api/oauth2/v2/campaigns/4682437/members?include=currently_entitled_tiers&fields[member]=full_name,currently_entitled_amount_cents`)
const express = require('express')
const app = express()
const port = process.env.PORT

let lastSaved = 0

const redis = require("redis")
const client = redis.createClient()
const { promisify } = require("util")
const get = promisify(client.get).bind(client)
const set = promisify(client.set).bind(client)

const getAll = async (u) => {
  let reqs = []
  let nextUrl = u

  while (nextUrl !== null) {
    let response = request.get(nextUrl).set('Authorization', 'Bearer ' + process.env.ACCESS_TOKEN)
    if (nextUrl !== null) {
      let res = await response
      nextUrl = res && res.body && res.body.links && res.body.links.next ? res.body.links.next : null
    }
    reqs.push(response)
  }

  return Promise.all(reqs)
}

const processName = name => {
  let split = name.split(' ')
  let res = ''
  if (split[1]) {
    if (split[0].length === 1 && !split[2]) {
      res = split[0]
      split.shift()
      res += '. ' + split.join('. ')
    } else {
      res = split[0]
      split.shift()
      split = split.map(e => e.charAt(0))
      res += ' ' + split.join('. ') + '.'
    }
  } else {
    res = name
  }

  return res.toLowerCase().trim()
}

const getSupporters = async () => {
  let r = await getAll(url)
  let pledgers = []
  r.forEach(e => {
    let mapped = e.body.data.map(e => ({ full_name: e.attributes.full_name, currently_entitled_amount_cents: e.attributes.currently_entitled_amount_cents }))
    mapped = mapped.filter(e => e.currently_entitled_amount_cents && e.currently_entitled_amount_cents !== 0)
    pledgers = [...pledgers, ...mapped]
  })
  
  return pledgers.reduce(function(a, x) {
    const tier = x.currently_entitled_amount_cents >= 600 ? 'gold' : x.currently_entitled_amount_cents >= 300 ? 'silver' : 'bronze'
    if (!a[tier]) a[tier] = []
    a[tier].push(processName(x.full_name))
    return a
  }, {})
}

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
})

app.get('/getSupporters', async (req, res) => {
  let d = +new Date()
  if ((lastSaved + (60000 * 5)) < d) {
    const r = await getSupporters()
    set('nook:pledges', JSON.stringify(r))
    res.json(r)
  } else {
    get('nook:pledges').then((r) => {
      res.json(JSON.parse(r))
    })
  }
})

app.listen(port, () => {
  console.log(`Patreon API listening on port ${port}`)
})
