import 'dotenv/config';
import pkg from 'cfonts';
const { say } = pkg;
import makeWASocket, {
    delay,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidNormalizedUser,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
} from 'baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import chalk from 'chalk';
import moment from 'moment';
import readlineSync from 'readline-sync'; // Import readline-sync

import treeKill from './lib/tree-kill.js';
import serialize, { Client } from './lib/serialize.js';
import { formatSize, parseFileSize, sendTelegram } from './lib/function.js';

const startTimeFile = './startTime.json';

// Fungsi untuk menyimpan waktu mulai bot ke file
function saveStartTime() {
    const startTime = moment().toISOString();
    fs.writeFileSync(startTimeFile, JSON.stringify({ startTime }));
}

// Fungsi untuk membaca waktu mulai bot dari file
function getStartTime() {
    if (fs.existsSync(startTimeFile)) {
        const data = fs.readFileSync(startTimeFile, 'utf-8');
        const { startTime } = JSON.parse(data);
        return moment(startTime);
    } else {
        const startTime = moment();
        saveStartTime(startTime);
        return startTime;
    }
}

// Fungsi untuk menghasilkan warna acak
function getRandomColor() {
    const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Fungsi untuk mencetak garis pemisah
function printSeparator() {
    console.log(chalk.magenta('='.repeat(50)));
}

// Fungsi untuk menampilkan daftar fitur dan statusnya dengan warna acak
function displayFeatureStatus() {
    const features = {
        'Auto Restart': process.env.AUTO_RESTART === 'true' ? 'Enabled' : 'Disabled',
        'Auto Typing': process.env.AUTO_TYPING === 'true' ? 'Enabled' : 'Disabled',
        'Auto Read Story Speed': process.env.AUTO_READ_SPEED ? `${process.env.AUTO_READ_SPEED} ms` : 'Disabled',
        'Self Mode': process.env.SELF === 'true' ? 'Enabled' : 'Disabled',
        'Write Store': process.env.WRITE_STORE === 'true' ? 'Enabled' : 'Disabled',
        'Telegram Backup': process.env.TELEGRAM_TOKEN && process.env.ID_TELEGRAM ? 'Enabled' : 'Disabled'
    };

    console.log(chalk.green('\nFitur dan Status:'));
    Object.entries(features).forEach(([feature, status]) => {
        const color = getRandomColor();
        console.log(chalk[color](`- ${feature}: ${status}`));
    });
}

// Fungsi untuk menampilkan hari, bulan, dan tahun saat bot dijalankan
function displayCurrentDate() {
    const currentDate = moment().format('dddd, MMMM Do YYYY');
    console.log(chalk.blue(`\nTanggal Hari Ini: ${currentDate}\n`));
}

// Fungsi untuk memperbarui bio dengan uptime
function updateBio(hisoka, startTime) {
    setInterval(async () => {
        const currentTime = moment();
        const duration = moment.duration(currentTime.diff(startTime));
        const uptime = `${duration.days()}d ${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`;
        try {
            await hisoka.updateProfileStatus(`Uptime: ${uptime}`);
            console.log(chalk.green(`Bio updated to: Uptime: ${uptime}`));
        } catch (error) {
            console.error(chalk.red('Failed to update bio:'), error);
        }
    }, 60000); // Perbarui setiap 1 menit
}

// Fungsi untuk autentikasi
function authenticate() {
    const correctUsername = 'wily';
    const correctPassword = 'wily007';

    printSeparator();
    console.log(chalk.yellow('Autentikasi Diperlukan'));
    printSeparator();

    const username = readlineSync.question('Enter username: ');
    const password = readlineSync.question('Enter password: ', { hideEchoBack: true });

    if (username !== correctUsername || password !== correctPassword) {
        printSeparator();
        console.log(chalk.red('Maaf, username dan password ada yang salah.'));
        console.log(chalk.red('Tolong hubungi admin ke nomer WhatsApp berikut untuk meminta username dan password yang benar:'));
        console.log(chalk.red('+62850988773477'));
        printSeparator();
        process.exit(1);
    }

    printSeparator();
    console.log(chalk.green('Authentication successful!'));
    printSeparator();
}

// Autentikasi sebelum memulai bot
authenticate();

// Tampilkan teks saat bot dimulai
say('auto-read-sw\nby-wily-kun', {
    font: 'tiny',
    align: 'center',
    colors: [getRandomColor()],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: '0',
    gradient: true,
    independentGradient: false,
    transitionGradient: false,
    env: 'node',
    border: 'underline',
});

// Cetak garis pemisah
printSeparator();

// Tampilkan hari, bulan, dan tahun saat bot dijalankan
displayCurrentDate();

// Tampilkan daftar fitur dan statusnya
displayFeatureStatus();

// Cetak garis pemisah
printSeparator();

const logger = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` }).child({ class: 'hisoka' });
logger.level = 'fatal';

const usePairingCode = process.env.PAIRING_NUMBER;
const store = makeInMemoryStore({ logger });

if (process.env.WRITE_STORE === 'true') store.readFromFile(`./${process.env.SESSION_NAME}/store.json`);

// check available file
const pathContacts = `./${process.env.SESSION_NAME}/contacts.json`;
const pathMetadata = `./${process.env.SESSION_NAME}/groupMetadata.json`;

// kecepatan auto read story dari .env
const autoReadSpeed = parseInt(process.env.AUTO_READ_SPEED) || 1000;
// status auto typing dari .env
const autoTyping = process.env.AUTO_TYPING === 'true';

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(`./${process.env.SESSION_NAME}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    /**
     * @type {import('baileys').WASocket}
     */
    const hisoka = makeWASocket.default({
        version,
        logger,
        printQRInTerminal: !usePairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        retryRequestDelayMs: 10,
        transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 10 },
        defaultQueryTimeoutMs: undefined,
        maxMsgRetryCount: 15,
        appStateMacVerification: {
            patch: true,
            snapshot: true,
        },
        getMessage: async key => {
            const jid = jidNormalizedUser(key.remoteJid);
            const msg = await store.loadMessage(jid, key.id);

            return msg?.message || '';
        },
        shouldSyncHistoryMessage: msg => {
            console.log(`\x1b[32mMemuat Chat [${msg.progress}%]\x1b[39m`);
            return !!msg.syncType;
        },
    });

    store.bind(hisoka.ev);
    await Client({ hisoka, store });

    // login dengan pairing
    if (usePairingCode && !hisoka.authState.creds.registered) {
        try {
            let phoneNumber = usePairingCode.replace(/[^0-9]/g, '');

            await delay(3000);
            let code = await hisoka.requestPairingCode(phoneNumber);
            console.log(`\x1b[32m${code?.match(/.{1,4}/g)?.join('-') || code}\x1b[39m`);
        } catch {
            console.error('Gagal mendapatkan kode pairing');
            process.exit(1);
        }
    }

    // ngewei info, restart or close
    hisoka.ev.on('connection.update', async update => {
        const { lastDisconnect, connection } = update;
        if (connection) {
            console.info(`Connection Status : ${connection}`);
        }

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;

            switch (reason) {
                case DisconnectReason.multideviceMismatch:
                case DisconnectReason.loggedOut:
                case 403:
                    console.error(lastDisconnect.error?.message);
                    await hisoka.logout();
                    fs.rmSync(`./${process.env.SESSION_NAME}`, { recursive: true, force: true });
                    exec('npm run stop:pm2', err => {
                        if (err) return treeKill(process.pid);
                    });
                    break;
                default:
                    console.error(lastDisconnect.error?.message);
                    if (process.env.AUTO_RESTART === 'true') {
                        await startSock();
                    }
            }
        }

        if (connection === 'open') {
            hisoka.sendMessage(jidNormalizedUser(hisoka.user.id), { text: `${hisoka.user?.name} has Connected...` });
        }
    });

    // write session kang
    hisoka.ev.on('creds.update', saveCreds);

    // contacts
    if (fs.existsSync(pathContacts)) {
        store.contacts = JSON.parse(fs.readFileSync(pathContacts, 'utf-8'));
    } else {
        fs.writeFileSync(pathContacts, JSON.stringify({}));
    }
    // group metadata
    if (fs.existsSync(pathMetadata)) {
        store.groupMetadata = JSON.parse(fs.readFileSync(pathMetadata, 'utf-8'));
    } else {
        fs.writeFileSync(pathMetadata, JSON.stringify({}));
    }

    // add contacts update to store
    hisoka.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = jidNormalizedUser(contact.id);
            if (store && store.contacts) store.contacts[id] = { ...(store.contacts?.[id] || {}), ...(contact || {}) };
        }
    });

    // add contacts upsert to store
    hisoka.ev.on('contacts.upsert', update => {
        for (let contact of update) {
            let id = jidNormalizedUser(contact.id);
            if (store && store.contacts) store.contacts[id] = { ...(contact || {}), isContact: true };
        }
    });

    // nambah perubahan grup ke store
    hisoka.ev.on('groups.update', updates => {
        for (const update of updates) {
            const id = update.id;
            if (store.groupMetadata[id]) {
                store.groupMetadata[id] = { ...(store.groupMetadata[id] || {}), ...(update || {}) };
            }
        }
    });

    // merubah status member
    hisoka.ev.on('group-participants.update', ({ id, participants, action }) => {
        const metadata = store.groupMetadata[id];
        if (metadata) {
            switch (action) {
                case 'add':
                case 'revoked_membership_requests':
                    metadata.participants.push(...participants.map(id => ({ id: jidNormalizedUser(id), admin: null })));
                    break;
                case 'demote':
                case 'promote':
                    for (const participant of metadata.participants) {
                        let id = jidNormalizedUser(participant.id);
                        if (participants.includes(id)) {
                            participant.admin = action === 'promote' ? 'admin' : null;
                        }
                    }
                    break;
                case 'remove':
                    metadata.participants = metadata.participants.filter(p => !participants.includes(jidNormalizedUser(p.id)));
                    break;
            }
        }
    });

    // bagian pepmbaca status ono ng kene
    hisoka.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages[0].message) return;
        let m = await serialize(hisoka, messages[0], store);

        // nambah semua metadata ke store
        if (store.groupMetadata && Object.keys(store.groupMetadata).length === 0) store.groupMetadata = await hisoka.groupFetchAllParticipating();

        // untuk membaca pesan status
        if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
            if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;
            
            // auto read dengan kecepatan dari .env
            await delay(autoReadSpeed);
            await hisoka.readMessages([m.key]);
            let id = m.key.participant;
            let name = hisoka.getName(id);

            // react status
            const emojis = process.env.REACT_STATUS.split(',')
                .map(e => e.trim())
                .filter(Boolean);

            if (emojis.length) {
                await hisoka.sendMessage(
                    'status@broadcast',
                    {
                        react: { key: m.key, text: emojis[Math.floor(Math.random() * emojis.length)] },
                    },
                    {
                        statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(id)],
                    }
                );
            }

            if (process.env.TELEGRAM_TOKEN && process.env.ID_TELEGRAM) {
                if (m.isMedia) {
                    let media = await hisoka.downloadMediaMessage(m);
                    let caption = `Dari : https://wa.me/${id.split('@')[0]} (${name})${m.body ? `\n\n${m.body}` : ''}`;
                    await sendTelegram(process.env.ID_TELEGRAM, media, { type: /audio/.test(m.msg.mimetype) ? 'document' : '', caption });
                } else await sendTelegram(process.env.ID_TELEGRAM, `Dari : https://wa.me/${id.split('@')[0]} (${name})\n\n${m.body}`);
            }
        }

        // status self apa publik
        if (process.env.SELF === 'true' && !m.isOwner) return;

        // fitur auto typing
        if (autoTyping) {
            await hisoka.sendPresenceUpdate('composing', m.key.remoteJid);
        }

        // kanggo kes
        await (await import(`./message.js?v=${Date.now()}`)).default(hisoka, store, m);
    });

    setInterval(async () => {
        // write contacts and metadata
        if (store.groupMetadata) fs.writeFileSync(pathMetadata, JSON.stringify(store.groupMetadata));
        if (store.contacts) fs.writeFileSync(pathContacts, JSON.stringify(store.contacts));

        // write store
        if (process.env.WRITE_STORE === 'true') store.writeToFile(`./${process.env.SESSION_NAME}/store.json`);

        // untuk auto restart ketika RAM sisa 300MB
        const memoryUsage = os.totalmem() - os.freemem();

        if (memoryUsage > os.totalmem() - parseFileSize(process.env.AUTO_RESTART, false)) {
            await hisoka.sendMessage(
                jidNormalizedUser(hisoka.user.id),
                { text: `penggunaan RAM mencapai *${formatSize(memoryUsage)}* waktunya merestart...` },
                { ephemeralExpiration: 24 * 60 * 60 * 1000 }
            );
            exec('npm run restart:pm2', err => {
                if (err) return process.send('reset');
            });
        }
    }, 10 * 1000); // tiap 10 detik

    process.on('uncaughtException', console.error);
    process.on('unhandledRejection', console.error);

    // Baca waktu mulai bot dari file atau inisialisasi waktu baru jika file tidak ada
    const startTime = getStartTime();
    // Mulai memperbarui bio dengan uptime
    updateBio(hisoka, startTime);
};

startSock();