import { Email, type EmailConnection } from './mailbox_connection.ts';

export class TestConnection implements EmailConnection {

    constructor(private onMsg: (mail: Email) => void) {}

    async connect() {
        console.log('Running in command test mode');
        console.log('>');

        let input: string = '';
        for await (const line of console) {
            if (line === '') {
                await this.onMsg(new Email('admin@test.com', 'admin', 'test', 'test', 'command', input));
                input = '';
                console.log('>');
            }
            input += line + '\n';
        }
        return Promise.resolve();
    }

    sendReply(original: Email, response: string, isHtml?: boolean): Promise<boolean> {
        console.log(response);
        return Promise.resolve(true);
    }

}