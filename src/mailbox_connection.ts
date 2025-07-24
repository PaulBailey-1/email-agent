import Imap from 'imap';
import { simpleParser, type ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import type { MailOptions } from 'nodemailer/lib/json-transport';
import EmailReplyParser from 'email-reply-parser';

const replyParser = new EmailReplyParser();

export class Email {

    constructor(
        public sender: string,
        public senderName: string,
        public id: string,
        public chainId: string,
        public subject: string,
        public body: string,
    ) {}

    static fromParsed(parsedEmail: ParsedMail) {
        const from = parsedEmail.from?.value[0];
        if (!from) {
            throw Error('Failed to get sender address');
        }
        if (!parsedEmail.messageId) {
            throw Error('Failed to get message id');
        }
        const sender = from.address as string;
        const senderName = from.name as string;
        const id = parsedEmail.messageId;
        
        let chainId = parsedEmail.references ?? id;
        if (typeof chainId !== 'string') {
            chainId = chainId[0] ?? id;
        }
        const subject = parsedEmail.subject ?? '';
        let body = '';
        if (parsedEmail.text) {
            body = replyParser.read(parsedEmail.text).getVisibleText();
        }
        return new Email(sender, senderName, id, chainId, subject, body);
    }
    
    print() {
        console.log(`Email from ${this.sender} (${this.senderName})`);
        console.log(`--- ${this.subject} ---`);
        console.log(this.body + '\n');
    }
}

export interface EmailConnection {
    connect(): Promise<void>;
    sendReply(original: Email, response: string, isHtml: boolean): Promise<boolean>;
}

export class MailboxConnection implements EmailConnection {

    readonly agentEmail: string;

    private readonly imap: Imap;
    private readonly smtp;
    private imapConnected: boolean = false;
    private mailbox: Imap.Box | undefined;

    constructor(private onMailCallback: (mail: Email) => void) {
        if (!('EMAIL_AGENT_USER' in process.env)) {
            throw Error('EMAIL_AGENT_USER environment variable must be set to the gmail to use.')
        }
        if (!('EMAIL_AGENT_PW' in process.env)) {
            throw Error('EMAIL_AGENT_PW environment variable must be set to a gmail app password.')
        }

        this.agentEmail = process.env.EMAIL_AGENT_USER as string;
        const emailPassword = process.env.EMAIL_AGENT_PW as string;
        const mailbox = 'gmail.com';
        
        // Connect over IMAP for recieving
        this.imap = new Imap({
            user: this.agentEmail,
            password: emailPassword,
            host: `imap.${mailbox}`,
            port: 993,
            tls: true,
            tlsOptions: {
                servername: `imap.${mailbox}`
            }
        });
        this.setupImap();

        // Connect over SMTP for sending
        this.smtp = nodemailer.createTransport({
          host: `smtp.${mailbox}`,
          port: 465,
          secure: true,
          auth: {
            user: this.agentEmail,
            pass: emailPassword
          },
        });
        this.smtp.addListener('error', (err) => {
            console.log('SMTP Error: ', err);
            process.exit(1);
        });
    }

    async connect(): Promise<void> {

        this.imap.connect();
        const imapPromise = new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (this.imapConnected) {
                    console.log(`Connected via IMAP to ${this.agentEmail} mailbox ${this.mailbox?.name}`)
                    console.log(`${this.mailbox?.messages.new} new messages, ${this.mailbox?.messages.total} total messages`)
                    clearInterval(interval);
                    resolve();
                }
            });
        });

        const smtpPromise = new Promise<void>((resolve) => {
            this.smtp.verify(() => {
               console.log(`Connected via SMAP to ${this.agentEmail}`)
               resolve();
           });
        });

        await Promise.all([imapPromise, smtpPromise]);
        return Promise.resolve();
    }

    private setupImap() {
        
        const openInbox = (cb: (err: Error | null, box: Imap.Box) => void) => {
            this.imap.openBox('INBOX', false, cb);
        }
        
        this.imap.once('ready', () => {
            openInbox( (err, box) => {
                if (err) throw err;
                this.mailbox = box;
                this.imapConnected = true;
            });
        });
        
        this.imap.on('mail', (numNewMsgs: number) => {
            this.imap.search(['UNSEEN'], (err, results) => {
        
                if (err) throw err;
                if (!results.length) return
        
                const fetch = this.imap.fetch(results, { markSeen: true, bodies: '' });
        
                fetch.on('message', (msg, seqNum) => {
                    
                    let buffer = '';
                    msg.on('body', (stream, info) => {
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8')
                        });
                        stream.once('end', async () => {
                            console.log('Recieved Message #' + seqNum)
                            const parsedEmail = await simpleParser(buffer);
                            try {
                                await this.onMailCallback(Email.fromParsed(parsedEmail))
                            } catch (err) {
                                console.log('Discarding recieved email - ', err);
                                console.log(parsedEmail);
                            }
                        });
                    });
                });
            })
        });
        
        
        this.imap.once('error', (err: any) => {
            console.error('IMAP error:', err);
            process.exit(1);
        });
        
        this.imap.once('end', () => {
            console.log('IMAP connection ended');
            process.exit(1);
        });
        
    }

    async sendReply(original: Email, response: string, isHtml: boolean = false): Promise<boolean> {

        const options: MailOptions = {
            from: { name: 'The Frog', address: this.agentEmail },
            to: original.sender,
            subject: 'Re: ' + original.subject,
            text: !isHtml ? response : undefined,
            html: isHtml ? response : undefined,
            inReplyTo: original.id,
            references: [original.chainId, original.id]
        }
        const res = await this.smtp.sendMail(options);
        return Promise.resolve(res.rejected.length > 0);
    }
}