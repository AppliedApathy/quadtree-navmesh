const u = {
  range: (start, end) => {
    if(!end) {
      end = start
      start = 0
    }
    return [...Array(end - start + 1)].map((_, i) => start + i)
  },

  randomInt: (min, max) => Math.floor(Math.random() * (max - min)) + min,

  arrow: (ctx) => (from, to) => {
      var headlen = 10;
      var angle = Math.atan2(to.y-from.y,to.x-from.x);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.lineTo(to.x-headlen*Math.cos(angle-Math.PI/12),to.y-headlen*Math.sin(angle-Math.PI/12));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x-headlen*Math.cos(angle+Math.PI/12),to.y-headlen*Math.sin(angle+Math.PI/12));
  }
}

const Rect = function(props) {
  Object.assign(this, props)
  const {x,y,w,h} = props
  this.left = x
  this.right = x+w
  this.bottom = y
  this.top = y+h
  this.topLeft = {x, y: this.top}
  this.topRight = {x: this.right, y: this.top}
  this.bottomLeft = {x, y}
  this.bottomRight = {x: this.right, y}
  this.center = {x: this.x+this.w/2, y: this.y+this.h/2}
  this.terminal = true
}

Rect.fromPoints = (p1, p2) =>
  new Rect({x:p1.x, y:p1.y, w: p2.x-p1.x, h: p2.y-p1.y})

Rect.fromPoints2 = (p1, p2) =>
  new Rect({x: p1.x, y: p2.y, w: p2.x-p1.x, h: p1.y-p2.y})

const pad = (str, to, fill = '0') => Array(to-String(str).length+1).join(fill)+str
const flatMap = (arr, cb) => Array.prototype.concat.apply([], arr.map(cb))
// http://ibis.geog.ubc.ca/courses/klink/gis.notes/ncgia/u37.html#SEC37.4.5
const bin = {0: '00', 1: '01', 2: '10', 3: '11'}
const binRev = Object.keys(bin).reduce((acc, k) => Object.assign(acc, {[bin[k]]: k}), {})
const toBin = code => (''+code).split('').map(char => bin[char]).join('')
const fromBin = bin => {
  bin = ''+bin
  if(bin.length%2 === 1)
    bin = '0'+bin
  return bin.match(/.{2}/g).map(char => binRev[char]).join('')
}

//http://bitmath.blogspot.ru/2012/11/tesseral-arithmetic-useful-snippets.html
const incx = z => {
    const xsum = (z | 0xAAAAAAAA) + 1
    return (xsum & 0x55555555) | (z & 0xAAAAAAAA)
}

const incy = z => {
    const ysum = (z | 0x55555555) + 2
    return (ysum & 0xAAAAAAAA) | (z & 0x55555555)
}

const decx = z => {
    const xsum = (z & 0x55555555) - 1
    return (xsum & 0x55555555) | (z & 0xAAAAAAAA)
}

const decy = z => {
    const ysum = (z & 0xAAAAAAAA) - 2
    return (ysum & 0xAAAAAAAA) | (z & 0x55555555)
}

const codes = {
  adjacent: code => {
    v = parseInt(toBin(code), 2)
    const ret = [decy(v), incy(v), decx(v), incx(v)]
      .map(v => Math.abs(v) > 999999/*TODO*/ ? null : v)
      .map(v => v === null ? v : pad(fromBin(v.toString(2)), code.length))
      .map(v => (v != null && v.length == code.length) ? v : null) //TODO fixes magic. ex: adjacent(233)
    return {
      top: ret[0],
      bottom: ret[1],
      left: ret[2],
      right: ret[3],
    }
  },

  edges: (parent, code) => {
    const ret = []
    const diff = code.slice(parent.length, code.length).split('')
    if(diff.every(c => c == '0' || c == '1')) ret.push('top')
    if(diff.every(c => c == '2' || c == '3')) ret.push('bottom')
    if(diff.every(c => c == '0' || c == '2')) ret.push('left')
    if(diff.every(c => c == '1' || c == '3')) ret.push('right')
    return ret
  },
}


let graph = {}
Rect.prototype = {
  overlaps: function(rect) {
    return (this.left < rect.right) && (this.right > rect.left) && (this.bottom < rect.top) && (this.top > rect.bottom)
  },

  covers: function(rect) {
    return (this.left < rect.left) && (this.right > rect.right) && (this.bottom < rect.bottom) && (this.top > rect.top)
  },

  //quadtree stuff

  quadSplit: function(ratioX = 1, ratioY = 1) {
    this.terminal = false
    return [
      Rect.fromPoints(this.bottomLeft, this.center),
      Rect.fromPoints2(this.center, this.bottomRight),
      Rect.fromPoints2(this.topLeft, this.center),
      Rect.fromPoints(this.center, this.topRight),
    ].map((rect, i) => {
      rect.code = (''+(this.code || '')) + i
      return rect
    })
  },

  blockedSides: function() {
    const sides = {top: false, bottom: false, left: false, right: false}
    this.contains.forEach(rect => {
      if(rect.covers(this)) Object.keys(sides).forEach(k => sides[k] = true)
      if(rect.top > this.top && rect.bottom < this.bottom) {
        if(rect.left < this.right && rect.left > this.left) sides.right = true
        if(rect.right > this.left && rect.right < this.right) sides.left = true
      }
      if(rect.left < this.left && rect.right > this.right) {
        if(rect.bottom < this.top && rect.bottom > this.bottom) sides.bottom = true
        if(rect.top > this.bottom && rect.top < this.top) sides.top = true
      }
    })
    return Object.keys(sides).filter(k => sides[k])
  },

  adjacent: function() {
    const adj = codes.adjacent(this.code)
    this.blockedSides().forEach(side => delete adj[side])
    return Object.keys(graph).filter(k => {
      const node = graph[k]
      if(!(node.terminal)) return false
      // if(node.contains.length) return false;
      if(k.length <= this.code.length) //up
        return Object.values(adj).find(v => v != null && v.startsWith(k))
      else //down
        return (k.startsWith(adj.top) && codes.edges(adj.top, k).includes('bottom')) ||
          (k.startsWith(adj.bottom) && codes.edges(adj.bottom, k).includes('top')) ||
          (k.startsWith(adj.left) && codes.edges(adj.left, k).includes('right')) ||
          (k.startsWith(adj.right) && codes.edges(adj.right, k).includes('left'))
    }).map(k => graph[k])
  },

  buildNavmesh: function(maxDepth) {
      Object.keys(graph).forEach(k => k.startsWith(this.code) ? delete graph[k] : null)
      const navmesh = []
      const walk = (rect) => {
        if(rect.contains.length && rect.depth < maxDepth) {
          if(rect.contains.find(o => o.covers(rect))) return
          rect.quadSplit().forEach(child => {
            child.depth = rect.depth + 1
            child.contains = rect.contains.filter(o => child.overlaps(o))
            walk(child)
          })
        } else {
          navmesh.push(rect)
        }
        graph[rect.code] = rect
      }
      walk(this)
      return navmesh
  }
}

const demo = {
  maxX: 640, maxY: 480, maxDepth: 4,

  obstacles: [],
  navmesh: [],

  generateObstacles: function() {
    this.obstacles = []
    // this.obstacles = u.range(9).map(i => {
    //   const w = u.randomInt(this.maxX/32, this.maxX/4), h = u.randomInt(this.maxY/32, this.maxY/4)
    //   return new Rect({
    //     w,h,
    //     x: u.randomInt(0, this.maxX - w),
    //     y: u.randomInt(0, this.maxY - h),
    //   })
    // })
  },

  buildNavmesh: function() {
    const root = new Rect({x: 0, y: 0, w: this.maxX, h: this.maxY})
    root.contains = this.obstacles//[...this.obstacles]
    root.depth = 0
    root.code = ''+0
    this.navmesh = root.buildNavmesh(this.maxDepth)
    this.root = root
  },

  draw: function() {
    const canvas = document.getElementById('main')
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black'
    this.obstacles.forEach(o => {
      //ctx.strokeRect(o.x, o.y, o.w, o.h)
      ctx.fillRect(o.x, o.y, o.w, o.h)
    })

    ctx.fillStyle = 'rgba(255, 0, 0, .5)'
    ctx.font = '8px Sans'
    this.navmesh.forEach(o => {
      ctx.strokeStyle = 'red'
      ctx.strokeRect(o.x, o.y, o.w, o.h)
      ctx.strokeText(o.code, o.center.x, o.center.y)
      // if(o.contains.length) {
      //   // ctx.fillRect(o.x, o.y, o.w, o.h)
      // } else {
        ctx.strokeStyle = 'green'
        ctx.beginPath()
        o.adjacent().map(c => {
          u.arrow(ctx)(o.center, c.center)
        })
        ctx.stroke()
      // }
    })
  },

  start: function() {
    this.generateObstacles()
    this.buildNavmesh()
    const canvas = document.getElementById('main')
    canvas.addEventListener('click', (ev) => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      // if(x > 0 && y > 0) {
        const w = u.randomInt(this.maxX/32, this.maxX/4), h = u.randomInt(this.maxY/32, this.maxY/4)
        this.obstacles.push(new Rect({
          w,h,
          x: x - w/2,//u.randomInt(0, this.maxX - w),
          y: y - h/2//u.randomInt(0, this.maxY - h),
        }))
        this.navmesh = this.root.buildNavmesh(this.maxDepth)
        this.draw()
      // }
    })
    this.draw()
  },
}

window.onload = () => {
  demo.start()
}
