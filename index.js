/* @flow */
import { spawn } from 'child_process';
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import JSONStream from 'jsonstream2-native';
import es from 'event-stream';
import table from 'text-table';
import {
  flip, lens, pluck, zipWith, merge, over, objOf, map, compose
} from 'ramda';

// Fun parts
// const log = (...xs) => console.log(xs) || xs;
const nameLens = lens(pluck('name'), zipWith(flip(merge)));

const tableTransform = xs => table(xs, {
  align: ['l', 'l', 'l'],
  stringLength: str => chalk.stripColor(str).length
})
.split('\n')
.map(objOf('name'));

const rowTransform = row => ({
  name: [
    chalk.bold.blue(row[0]),
    row[1], '❯',
    chalk.bold.green(row[3])
    // chalk.yellow(require(`${process.cwd()}/node_modules/${row[0]}/package.json`).homepage || '')
  ],
  value: row[0]
});

const makeChoices = compose(over(nameLens, tableTransform), map(rowTransform));

// Side effects
function yarnRunner (command, args, message, cb) {
  try {
    const spinner = ora(message).start();
    spawn('yarn', [command, '--json', ...args], { cwd: process.cwd() }).stdout
      .pipe(JSONStream.parse())
      .pipe(es.mapSync(output => cb(output || { type: 'unknown' }, spinner)));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

function run () {
  yarnRunner('outdated', [], 'Checking for updated packages.',
    async (output, spinner) => {
      switch (output.type) {
        case 'table':
          spinner.stop();
          const packages = await check(output.data.body);
          update(packages);
          break;
        case 'finished':
          // spinner.stop();
          // console.log(chalk.green('Yay! nothing to update!'));
          break;
        default:
      }
    });
}

function update (packages) {
  yarnRunner('add', packages, `Updating ${packages.join(', ')}.`,
    async (output, spinner) => {
      if (output && output.type === 'success') {
        spinner.stop();
        console.log(chalk.green(output.data));
      }
    });
}

async function check (packages) {
  const choices = makeChoices(packages);
  const answers = await inquirer.prompt([{
    name: 'packages',
    type: 'checkbox',
    message: 'Choose which packages to update.',
    choices,
    pageSize: process.stdout.rows - 2,
    validate: (answer) => {
      if (answer.length < 1) {
        return 'You must choose at least one package.';
      }
      return true;
    }
  }]);
  return answers.packages;
}

run();
