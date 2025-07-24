import { AgentDatabase, UserConfig } from './database.ts';
import { MailboxConnection, Email } from './mailbox_connection.ts';
import { queryChatSession } from './chat_client.ts';
import { ChatGPTRequest, CommandRequest, isChatGPTRequest, isCommandRequest, type AgentRequest } from './requests.ts';
import { type Config, config, configEnums, getConfigYaml, setConfig } from './config.ts';
import { TestConnection } from './test_connection.ts';

const helpMsg = `
Email Agent Command Help -

Subject must begin with 'command', body should be YAML in the following format:
password: <admin password>
command: <agent command>
<config>: <new value>

agent commands include:
    help - prints this help message
    info - prints agent info and config
    set-config - checks other fields for config values and sets them
    set-user-config - checks other fields for user level config values and sets them

config properties include:
    mode - Agent mode [${configEnums['mode']}]
    gptModel - ChatGPT model to use [${configEnums['gptModel']}]
    blackList - List of emails and domains to deny access to, ... expands to current list
    whiteList - List of emails and domains to allow access to, ... expands to current list
    defaultTokensLimit - The GPT tokens limit applied to new users

user config properties include:
    user - (Required) The email of the user to apply to, '*' for all (must set all fields)
    tokensLimit - The GPT token limit for the user
`;

function executeCommand(req: CommandRequest): string {
    if (req.parseErr) {
        return req.parseErr + '\n' + helpMsg;
    } 
    if (req.password! !== process.env.EMAIL_AGENT_ADMIN_PW) {
        return 'Failed to authenticate';
    }
    if (req.command === 'help') {
        return helpMsg;
    }
    if (req.command === 'info') {
        return getConfigYaml() + '\n' + db.getUserDataTable();
    }
    if (req.command === 'set-config') {
        let msg = '';
        for (const [key, val] of req.fields) {
            try {
                if (!(key in config)) {
                    throw Error(`Invalid config key "${key}"`);
                }
                const previous = (config as any)[key];
                setConfig(key as keyof Config, val);
                msg += `Changed ${key} from "${previous}" to "${val}"\n`;
            } catch (err) {
                if (err instanceof Error)
                    msg += err.message + '\n';
            }
        }
        db.updateConfig();
        return msg;
    }
    if (req.command === 'set-user-config') {
        if(!req.fields.has('user')) {
            return 'set-user-config must have user field';
        }
        const user = req.fields.get('user');
        const allUsers = user === '*';
        let userConfig;
        if (!allUsers) {
            userConfig = db.getUserConfig(user);
            if (userConfig === null) {
                return `No user "${user}"`;
            }
        } else {
            userConfig = new UserConfig();
        }
        let msg = `For user ${user} -\n`;
        for (const [key, val] of req.fields) {
            if (key === 'user') continue;
            if (!(key in userConfig)) {
                msg += `Invalid user config key "${key}"\n`;
            } else {
                msg += `Changed ${key} from "${userConfig[key as keyof UserConfig]}" to "${val}"\n`;
                (userConfig as any)[key] = val;
            }
        }
        db.updateUserConfig(userConfig, allUsers);
        return msg;
    }
    return 'Server error executing command';
}

function hasAccess(email: string) {
    if (config.blackList.includes(email)) return false;
    const idx = email.indexOf('@');
    if (idx < 1) return false;
    const domain = email.substring(idx);
    if (config.blackList.includes(domain)) return false;
    if (config.whiteList.includes(domain) || config.whiteList.includes(email)) return true;
    return false;
}

function parseRequest(mail: Email): AgentRequest {
    const strippedSubject = mail.subject.replaceAll('Re: ', '');
    if (strippedSubject.toLowerCase().startsWith('command')) {
        return new CommandRequest(mail.body);
    }
    return new ChatGPTRequest(mail.body);
}

async function handleRequest(mail: Email) {
    const req = parseRequest(mail);
    
    if (isCommandRequest(req)) {
        let res = executeCommand(req);
        await mailConn.sendReply(mail, res);
        console.log(`Handled command from ${mail.sender}`)
    } 
    else if (config.mode !== 'enabled') {
        await mailConn.sendReply(mail, 'This service has been disabled');
        console.log(`Denied disabled request from ${mail.sender}`)
    }
    else if (!hasAccess(mail.sender)) {
        await mailConn.sendReply(mail, 'You do not have access to this service');
        console.log(`Denied request from ${mail.sender}`)
    }
    else if (isChatGPTRequest(req)) {
        if (!db.checkTokenLimit(mail.sender)) {
            await mailConn.sendReply(mail, 'You have reached your limit for token usage. Please contact the admin to reactivate.');
            console.log(`Handled chat request from ${mail.sender} - Over token limit`)
        } else {
            let [answer, tokensUsed] = await queryChatSession(req.query, mail.chainId);
            if (answer.startsWith('```html')) {
                answer = answer.substring(7, answer.length - 3)
            }
            db.updateOnChatReq(mail, tokensUsed);
            await mailConn.sendReply(mail, answer, true);
            console.log(`Handled chat request from ${mail.sender}`)
        }
    }
}

const db = new AgentDatabase();

let connType;
if (process.argv.at(2) === 'test') {
    connType = TestConnection;
} else {
    connType = MailboxConnection;
}

const mailConn = new connType(handleRequest);
await mailConn.connect();

const green = Bun.color('green', 'ansi')
console.log(green + '%s\x1b[0m', 'Agent running');