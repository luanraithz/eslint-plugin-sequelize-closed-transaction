# Eslint plugin sequelize closed transaction

Check if your transactions are closed at every path


> `npm install --saved-dev eslint-plugin-sequelize-transaction`


## Valid code examples ✅ 
```javascript
async function simple() {
  const transaction = await sequelize.transaction();
  if (false) {
    await transaction.rollback()
    return
  }
  await transaction.rollback()
}`,
```
        
```javascript
async function withTryAndFinally() {
  const transaction = await sequelize.transaction();
  try {
    return 1
  } catch (err) {
    console.error()
  } finally {
    await transaction.rollback()
  }
}
```
```javascript
async function nested() {
  const transaction = await sequelize.transaction();
  {
    {
      {
        await transaction.rollback()
      }
    }
  }
}
```
```javascript
async function ifElse() {
  const transaction = await sequelize.transaction();
  if (123) {
    await transaction.rollback()
    return bla
  } else {
    await transaction.rollback()
  }
}
```

```javascript
const obj = {
  property: async () => {
    const transaction = await sequelize.transaction();
    if (123) {
      await transaction.rollback()
      return bla
    } else {
      await transaction.rollback()
    }
  }
}
```

## Example of invalid code

```javascript
async function nestedStatements() {
  let transaction = await sequelize.transaction();
  if (3 > 2) {
    if (4 > 2) {
      return 1
    }
    await transaction.rollback()
  }
  await transaction.rollback()
}
```

```javascript
async function noNesting() {
  const transaction = await sequelize.transaction();

  return await 1
}
```

```javascript
const obj = {
  func: async function () {
    const transaction = await sequelize.transaction();

    return await 1
  }
}
```

```javascript
const obj = {
  arrow: async () => {
    const transaction = await sequelize.transaction();

    return await 1
  }
}
```