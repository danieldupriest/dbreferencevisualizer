const config = require('./config.js');
const mysql = require('mysql');
const util = require('util');
const { table } = require('console');

const columnWidth = 20;

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
  constructor(name) {
    this.name = name;
    this.children = {};
  }

  height() {
    let childrenHeight = 0;

    const children = Object.values(this.children);
    for (const child of children) {
      childrenHeight += child.height();
    }

    return Math.max(2, childrenHeight);
  }

  width() { 
    return this.toString().length;
  }

  render(canvas, xOffset = 0, yOffset = 0) {
    const tableNameWidth = this.width();
    const fields = Object.keys(this.children);
    const children = Object.values(this.children);

    // Draw table name
    canvas.draw(this.toString(), xOffset, yOffset);
    
    // Find width to draw fields
    let maxFieldWidth = 0;
    for (const field of fields) {
      maxFieldWidth = Math.max(maxFieldWidth, field.length);
    }
    maxFieldWidth += 2;

    // Draw fields and children
    let y = 0;
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      const field = fields[j];

      // Draw connecting dots
      for (let i = 0; i < maxFieldWidth; i++) {
        canvas.draw('·', xOffset + tableNameWidth + 3 + i, yOffset + y)  
      }

      // Draw vertical lines
      if (j < children.length - 1) {
        for (let i = 0; i <= child.height(); i++) {
          canvas.draw('║', xOffset + tableNameWidth, yOffset + y + i);
        }
      }
      
      // Draw conjunctions
      if (children.length === 1) {
        canvas.draw('═', xOffset + tableNameWidth, yOffset);
      } else if (j === children.length - 1) {
        canvas.draw('╚', xOffset + tableNameWidth, yOffset + y);
      } else if (j === 0) {
        canvas.draw('╦', xOffset + tableNameWidth, yOffset + y);
      } else {
        canvas.draw('╠', xOffset + tableNameWidth, yOffset + y);
      }
      
      // Draw field
      canvas.draw(' ' + field + ' ', xOffset + tableNameWidth + 1, yOffset + y);

      child.render(
        canvas,
        xOffset + tableNameWidth + maxFieldWidth + 2,
        yOffset + y,
      );

      y += child.height();
    }
    
    return canvas;
  }
  /*
  ┌───────┬────────────┐
│       │            │
│       │            │
│       │            │
├───────┼────────────┤
│       │            │
│       │            │
├───────┼──────────┐ │
│       │          │ │
│       │          │ │
│       │          │ │
│       │          │ │
│       │          │ │
│       │          │ │
│       │          │ │
└───────┴──────────┴─┘
*/
  toString() {
    return ' [' + this.name + '] ';
  }

  addChild(name, child) {
    this.children[name] = child;
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

function half(length) {
  const left = Math.floor(length / 2);
  const right = Math.ceil(length / 2);
  return { left, right };
}

async function generateTables(db) {
  const tableNames = await getTables(db);
  tableNames.sort();

  const results = [];

  for (const tableName of tableNames) {
    const schemaText = await getCreateSchema(db, tableName);
    const table = new Table(schemaText)
    results.push(table);
  }

  return results;
}

function buildTree(tables, relationships, rootNodeName) {
  const rootNode = tables[rootNodeName];
  //console.log(rootNode);
  //console.log(tables);

  for (const { from, to, via } of relationships) {
    //console.log(from, to, via);
    tables[to].addChild(via, tables[from]);
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
    const node = new TreeNode(name)
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
