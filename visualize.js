const config = require('./config.js');
const mysql = require('mysql');
const util = require('util');
const { table } = require('console');

const columnWidth = 24;

class Canvas {
  constructor(width = 300, height = 300) {
    this.canvas = []
    
    for (let y = 0; y < height; y++){
      const row = [];
      for (let x = 0; x < width; x++){
        row.push('~');
      }
      this.canvas.push(row);
    }
    
    this.initialWidth = width;
    this.initialHeight = height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++ ) {
        this.canvas.push('~');
      }
    }
  }

  findLimits() {
    let minX = this.initialWidth;
    let maxX = 0;
    let minY = this.initialHeight;
    let maxY = 0;

    for (let y = 0; y < this.initialHeight; y++) {
      for (let x = 0; x < this.initialWidth; x++ ) {    
        if (this.canvas[y][x] !== '~'){
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + 1);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y + 1);
        }
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return { minX, maxX, minY, maxY, width, height };
  }

  toString() {
    const { minX, maxX, minY, maxY, width, height } = this.findLimits();
    let output = [];

    for (let y = minY; y < maxY; y++) {
      const row = [];
      for (let x = minX; x < maxX; x++ ) {
        const char = this.canvas[y][x];
        if (char !== '~')
          row.push(char);
        else row.push(' ');
      }
      output.push(row.join(''));
    }

    return output.join('\n');
  }

  draw(text, x = 0, y = 0) {
    const halfX = Math.floor(this.initialWidth / 2);
    const halfY = Math.floor(this.initialHeight / 2);

    for (let i = 0; i < text.length; i++) {
      const calculatedX = halfX + x + i;
      const calculatedY = halfY + y;

      if (
        y >= 0 &&
        y < this.canvas.length &&
        x >= 0 &&
        x < this.canvas[0].length
      )
        this.canvas[y][halfX + x + i] = text[i];
    }
  }  
}

class TreeNode {
  constructor(name, fill = '-') {
    this.name = name;
    this.children = [];
    this.fill = fill;
  }

  pad(text, width, fill = this.fill, left = true){
    const diff = width - text.length;
    if(diff < 0) throw new Error('Column not wide enough to pad.')
    let padding = fill.repeat(diff);
    if (left) return text + padding;
    else return padding + text;
  }  

  height() {
    let childrenHeight = 0;

    for (const child of this.children) {
      childrenHeight += child.height();
    }
    
    return Math.max(2, childrenHeight);
  }

  width() {
    return this.toString().length;
  }

  render() {
    const canvas = new Canvas(1000, 1000);
    let toRender = [];
    toRender.push([ { x: 0,  y: 0, node: this } ]);

    while (toRender.length > 0) {
      const columnNodes = toRender.shift();
      let levelWidth = 0;
      
      for (const { x, y, node } of columnNodes) {
        levelWidth = Math.max(node.width(), levelWidth);
      }
      
      let nextColumn = [];

      // Draw lines and children
      for (const { x, y, node } of columnNodes) {
        // Draw node
        if (!node.children.length) {
          canvas.draw(node.toString(), x, y);
          continue;
        }

        const nodeText = node.pad(node.toString(), levelWidth);
        canvas.draw(nodeText, x, y);

        // Draw connections to children
        let i = 0;
        
        for (let j = 0; j < node.children.length; j++) {
          const child = node.children[j];

          // Draw vertical lines
          if (j < node.children.length - 1) {
            for (let k = 0; k <= child.height(); k++) {
              canvas.draw('│', x + levelWidth, y + i + k);
            }
          }
          
          // Draw conjunctions
          if (node.children.length === 1) {
            canvas.draw('─', x + levelWidth, y);
          } else if (j === node.children.length - 1) {
            canvas.draw('└', x + levelWidth, y + i);
          } else if (j === 0) {
            canvas.draw('┬', x + levelWidth, y + i);
          } else {
            canvas.draw('├', x + levelWidth, y + i);
          }
          
          // Add children of next column.
          nextColumn.push({ x: x + levelWidth + 1, y: y + i, node: child });
          i += child.height();
        }
      }

      if (nextColumn.length > 0) toRender.push(nextColumn);
    }
    
    return canvas;
  }

  addChild(child) {
    this.children.push(child);
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
    }
  }
}

class Field extends TreeNode {
  constructor(name) {
    super(name);
  }

  pad(text, width, fill = '─'){
    const diff = width - text.length;
    if(diff < 0) throw new Error('Column not wide enough to pad.')
    let padding = fill.repeat(diff);
    return padding + text;
  }  

  toString() {
    return ' ' + this.name;
  }
}

class Table extends TreeNode {
  constructor(name) {
    super(name);
  }

  pad(text, width, fill = '─'){
    const diff = width - text.length;
    if(diff < 0) throw new Error('Column not wide enough to pad.')
    let padding = fill.repeat(diff);
    return text + padding;
  }

  toString() {
    return '[' + this.name + '] ';
  }
}

function makeDb(config) {
  const connection = mysql.createConnection(config);

  return {
    config,
    query(sql) {
      return util.promisify(connection.query).call(connection ,sql, []);
    },
    close() {
      return util.promisify(connection.end).call(connection);
    }
  }
}

function buildTree(tables, relationships, rootNodeName) {
  const rootNode = tables[rootNodeName];

  function formsCycle(node = rootNode, visited = []) {
    if (visited.includes(node)) return true;
    visited.push(node);

    for (const child of node.children) {
      if (formsCycle(child, visited)) return true;
    }

    return false;
  }
  
  // Link tables
  for (const { from, to, via } of relationships) {
    const fieldNode = new Field(via);
    fieldNode.addChild(tables[from]);
    tables[to].addChild(fieldNode);

    // Check if we created a cycle
    if (formsCycle(rootNode)) {
      tables[to].removeChild(fieldNode);
    }
  }

  return rootNode;
}

function getForeignKeys(rows) {
  const results = []

  for (const row of rows) {
    const regex = /FOREIGN KEY \(`([A-Za-z0-9_]*)`\) REFERENCES `([A-Za-z0-9_]*)` \(`.*`\) ON DELETE CASCADE/;
    const matched = row.match(regex);
    if (matched) {
      const key = {
        column: matched[1],
        references: matched[2],
      };

      results.push(key)
    }
  }
  
  return results;
}

async function generateRelationships(db) {
  const results = [];
  const tableNames = await getTableNames(db);

  for (const table of tableNames) {
    const rows = await getCreateSchema(db, table);
    const foreignKeys = getForeignKeys(rows);

    for (const { column, references } of foreignKeys) {
      const relation = {
        from: table,
        to: references,
        via: column,
      }

      results.push(relation);
    }
  }

  return results;
}

async function generateTables(db) {
  const tableNames = await getTableNames(db);
  const results = {};

  for (const name of tableNames) {
    const node = new Table(name)
    results[name] = node;
  }

  return results;
}

async function getTableNames(db) {
  const tables = await db.query(`
    SELECT * FROM information_schema.tables
    WHERE TABLE_SCHEMA = '${db.config.database}';`
  );
  return tables.map(t => t.TABLE_NAME);
}

async function getCreateSchema(db, table) {
  const results = await db.query(`SHOW CREATE TABLE ${table};`);
  const result = results[0];
  const raw = result['Create Table'];  
  const rows = raw.split('\n');
  rows.shift();
  return rows;
}

const main = async() => {
  const db = makeDb(config.db);
  const tables = await generateTables(db);
  const relationships = await generateRelationships(db);
  const tree = buildTree(tables, relationships, 'users');
  const canvas = new Canvas();
  const output = tree.render(canvas);
  console.log(output.toString());
  await db.close();
}

main();
