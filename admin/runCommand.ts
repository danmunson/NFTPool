import yargs from 'yargs';
import {Commands} from './commands';

async function main() {
    const args: any = yargs.argv;

    if (args.dryrun) {
        console.log('ARGS', args);
        return;
    }

    const commandName = args.command;
    if (!commandName) {
        throw new Error('Command not provided')
    }
    if (!(commandName in Commands)) {
        throw new Error('Command does not exist');
    }

    const command = Commands[commandName];
    await command(args);
}

main().catch((error) => {
    throw error;
});