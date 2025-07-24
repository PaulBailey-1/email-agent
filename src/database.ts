import { Database} from "bun:sqlite";
import type { Email } from "./mailbox_connection";
import { config, getConfigYaml, setConfigFromYaml } from "./config";
import { AsciiTable3 } from "ascii-table3";

export class UserConfig {
    email: string = '';
    tokensLimit: number = config.defaultTokensLimit;
}

export class AgentDatabase {

    private readonly db: Database;

    constructor() {
        this.db = new Database('db.sqlite', { strict: true })

        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                name TEXT,
                chatRequests INTEGER DEFAULT 0,
                tokensUsed INTEGER DEFAULT 0,
                tokensLimit INTEGER DEFAULT 250000
            );
            CREATE TABLE IF NOT EXISTS globals (
                config TEXT
            );
        `);

        const globals = this.db.query(`
            SELECT * FROM globals;
        `).get() as any;
        if (globals) {
            console.log('Loaded config from db -\n', globals.config);
            setConfigFromYaml(globals.config);
        } else {
            console.log('Default config -\n', getConfigYaml());
            this.db.query(`
                INSERT INTO globals (config) VALUES ($config);
            `).run({ config: getConfigYaml() });
        }
    }

    updateConfig() {
        this.db.query(`
            UPDATE globals
            SET config = $config
        `).run({ config: getConfigYaml() });
    }

    checkTokenLimit(userEmail: string): boolean {
        const res: any = this.db.query(`
            SELECT tokensUsed, tokensLimit FROM users WHERE email = $email
        `).get({ email: userEmail });
        if (res === null) return true;
        return res.tokensUsed < res.tokensLimit
    }

    updateOnChatReq(email: Email, tokensUsed: number) {
        this.db.query(`
            INSERT INTO users (email, name, chatRequests, tokensUsed, tokensLimit) 
            VALUES ($email, $name, 1, $tokensUsed, $tokensLimit)
            ON CONFLICT(email) DO
            UPDATE SET chatRequests = chatRequests + 1, tokensUsed = tokensUsed + $tokensUsed;
        `).run({ email: email.sender, name: email.senderName, tokensLimit: config.defaultTokensLimit, tokensUsed: tokensUsed });
    }

    getUserDataTable() {
        const usersData = this.db.query(`SELECT email, name, chatRequests, tokensUsed, tokensLimit FROM users`).values();
        const table = new AsciiTable3()
            .setTitleAlignCenter()
            .setTitle('User Data')
            .setHeadingAlignCenter()
            .setHeading('Email', 'Name', 'Chat Requests', 'Tokens Used', 'Tokens Limit')
            .addRowMatrix(usersData)
        return table.toString();
    }

    getUserConfig(userEmail: string): UserConfig | null {
        return this.db.query(`
            SELECT email, tokensLimit FROM users WHERE email = $email
        `).as(UserConfig).get({ email: userEmail });
    }

    updateUserConfig(userConfig: UserConfig, all: boolean) {
        const condition = !all ? 'WHERE email = $email' : ''
        this.db.query(`
            UPDATE users SET tokensLimit = $tokensLimit ${condition}
        `).run({ email: userConfig.email, tokensLimit: userConfig.tokensLimit });
    }

}