function roll(count = 1, sides = 6) {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
}

const sum = (values) => values.reduce((a, b) => a + b, 0);
const isDouble = (values) => values.length > 1 && values.every((v) => v === values[0]);

module.exports = { roll, sum, isDouble };
