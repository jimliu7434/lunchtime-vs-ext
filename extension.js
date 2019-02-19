// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { commands, window } = vscode;
const Redis = require('ioredis');
const UUIDV4 = require('uuid/v4');
const Moment = require('moment');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "lunchtime" is now active!');

	const userRedis = new Redis({
		host: '10.1.4.226',
		port: 6379,
		db: 8,
	});

	const sub = userRedis.duplicate();
	const pub = userRedis.duplicate();

	sub.on('message', (ch, msg) => {
		const body = JSON.parse(msg);
		const sender = body.session.name || 'Anonymous';
		if (body.session.sessionid) {
			window.showInformationMessage(`${Moment().format('HH:mm:ss')} [${sender}] to [${body.to}]: ${body.msg}`);
		}
	});

	const USERTABLE = `USERID`;
	const SESSIONTABLE = `SESSION`;
	const ChannelToAll = () => `CHANNEL-TOALL`;
	const ChannelToUser = (name) => `CHANNEL-${name}`;

	const Session = {
		login: 0,
		name: '',
		sessionid: '',
	};

	const InitPubSub = () => {
		if (Session.login === 1) {
	const ChannelToUser = (name) => `CHANNEL-${name}`;
			sub.subscribe(ChannelToAll(), ChannelToUser(Session.name));
		}
		else {
			sub.subscribe(ChannelToAll());
		}
	};

	let login = commands.registerCommand('extension.login', async () => {
		let prompt = 'Your nickname';
		const user = await window.showInputBox({ prompt, value: '' });

		prompt = 'Your password'
		const psw = await window.showInputBox({ prompt, value: '' });

		const correctPsw = await userRedis.hget(USERTABLE, user);
		if (correctPsw === null) {
			// register
			await userRedis.hset(USERTABLE, user, psw);

			window.showInformationMessage(`User ${user} created`);
		}
		else if (correctPsw !== psw) {
			vscode.window.showWarningMessage(`Login failed`);
			return;
		}

		// create a sessionid
		while (true) {
			const id = UUIDV4();
			sess = await userRedis.hget(SESSIONTABLE, id);
			if (sess === null) {
				Session.login = 1;
				Session.sessionid = id;
				Session.name = user;
				userRedis.hset(SESSIONTABLE, id, JSON.stringify(Session));
				break;
			}
		}

		// init sub/pub channel
		InitPubSub();

		window.showInformationMessage(`User ${user} login`);
	});

	let join = commands.registerCommand('extension.join', async () => {
		// create a sessionid
		while (true) {
			const id = UUIDV4();
			sess = await userRedis.hget(SESSIONTABLE, id);
			if (sess === null) {
				Session.sessionid = id;
				userRedis.hset(SESSIONTABLE, id, JSON.stringify(Session));
				break;
			}
		}

		// init sub/pub channel
		InitPubSub();

		window.showInformationMessage(`Anonymous join`);
	});

	let toall = commands.registerCommand('extension.toall', async () => {
		let prompt = 'Message';
		const msg = await window.showInputBox({ prompt, value: '' });

		if (pub && msg !== '') {
			const body = {
				session: Session,
				to: 'all',
				msg,
			}
			pub.publish(ChannelToAll(), JSON.stringify(body));
			window.showInformationMessage('msg sent');
		}
	});

	let touser = commands.registerCommand('extension.touser', async () => {
		let prompt = 'User nickname';
		const user = await window.showInputBox({ prompt, value: '' });
		prompt = 'Message';
		const msg = await window.showInputBox({ prompt, value: '' });

		if (pub && user !== '' && msg !== '') {
			const body = {
				session: Session,
				to: user,
				msg,
			}
			pub.publish(ChannelToUser(user), JSON.stringify(body));
			//window.showInformationMessage('msg sent');
		}
	});

	context.subscriptions.push(login, join, toall, touser);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
