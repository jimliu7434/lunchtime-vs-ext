// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { commands, window } = vscode;
const Redis = require('ioredis');
const UUIDV4 = require('uuid/v4');
const Moment = require('moment');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const userRedis = new Redis({
		host: '10.1.4.226',
		port: 6379,
		db: 8,
	});

	const sub = userRedis.duplicate();
	const pub = userRedis.duplicate();

	sub.on('message', (ch, msg) => {
		const body = JSON.parse(msg);
		if (body.session.sessionid) {
			const sender = body.session.name || 'Anonymous';
			const nw = Moment().format('HH:mm:ss');
			const line = `${nw} [${sender}] to [${body.to}]: ${body.msg}`;
			outputView.appendLine(line)
			window.showInformationMessage(line);
		}
	});

	const USERTABLE = `USERID`;
	const SESSIONTABLE = (id) => `SESSION>${id}`;
	const ChannelToAll = () => `CHANNEL-TOALL`;
	const ChannelToUser = (name) => `CHANNEL-${name}`;

	class UserSession {
		constructor({ login = 0, name = '', sessionid = '' } = { login: 0, name: '', sessionid: '' }) {
			this.login = login;
			this.name = name;
			this.sessionid = sessionid;
		}
	}

	let Session = new UserSession();
	const ExpirySec = 3600;	// 1 hr
	const ExpiredMsg = `Login expired or not login (join) yet`;
	const UserNotExistMsg = `Target user is not exist`;
	
	const outputView = window.createOutputChannel('talker view');
	context.subscriptions.push(outputView);
	outputView.show();

	const InitPubSub = () => {
		if (Session.login === 1) {
			const ChannelToUser = (name) => `CHANNEL-${name}`;
			sub.subscribe(ChannelToAll(), ChannelToUser(Session.name));
		}
		else {
			sub.subscribe(ChannelToAll());
		}
	};

	const CheckSession = async () => {
		if(Session.sessionid === '') {
			return false;
		}

		const sess = await userRedis.get(SESSIONTABLE(Session.sessionid));
		if(sess !== null) {
			return true;
		}

		return false;
	};

	const CheckUserExist = async (user) => {
		if(!user) {
			return false;
		}

		const exist = await userRedis.hget(USERTABLE, user);
		if(exist !== null) {
			return true;
		}

		return false;
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
			sess = await userRedis.get(SESSIONTABLE(id));
			if (sess === null) {
				Session = new UserSession({ login: 1, sessionid: id, name: user });
				userRedis.setex(SESSIONTABLE(id), ExpirySec, JSON.stringify(Session));
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
			sess = await userRedis.get(SESSIONTABLE(id));
			if (sess === null) {
				Session = new UserSession({ sessionid: id });
				userRedis.setex(SESSIONTABLE(id), ExpirySec, JSON.stringify(Session));
				break;
			}
		}

		// init sub/pub channel
		InitPubSub();

		window.showInformationMessage(`Anonymous join`);
	});

	let toall = commands.registerCommand('extension.toall', async () => {
		if ((await CheckSession()) !== true) {
			window.showWarningMessage(ExpiredMsg);
			return;
		}

		let prompt = 'Message';
		const msg = await window.showInputBox({ prompt, value: '' });

		if (pub && msg !== '') {
			// reset ex for session
			userRedis.setex(SESSIONTABLE(Session.sessionid), ExpirySec, JSON.stringify(Session));

			const body = {
				session: Session,
				to: 'all',
				msg,
			}
			pub.publish(ChannelToAll(), JSON.stringify(body));
		}
	});

	let touser = commands.registerCommand('extension.touser', async () => {
		if ((await CheckSession()) !== true) {
			window.showWarningMessage(ExpiredMsg);
			return;
		}

		let prompt = 'User nickname';
		const user = await window.showInputBox({ prompt, value: '' });
		prompt = 'Message';
		const msg = await window.showInputBox({ prompt, value: '' });

		if (pub && user !== '' && msg !== '') {
			// reset ex for session
			userRedis.setex(SESSIONTABLE(Session.sessionid), ExpirySec, JSON.stringify(Session));

			if((await CheckUserExist(user)) !== true) {
				window.showWarningMessage(UserNotExistMsg);
				return;
			}

			const body = {
				session: Session,
				to: user,
				msg,
			}
			pub.publish(ChannelToUser(user), JSON.stringify(body));
		}
	});

	let list = commands.registerCommand('extension.list', async () => {
		if (pub) {
			const list = await userRedis.hgetall(USERTABLE);
			const nw = Moment().format('HH:mm:ss');
			if(list) {
				outputView.appendLine(`${nw} [User List]:${Object.keys(list).join(',')}`);
			}
		}
	});

	context.subscriptions.push(login, join, toall, touser, list);
}
exports.activate = activate;

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
