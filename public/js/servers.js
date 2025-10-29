import { db } from './firebase-config.js'
import {
	ref,
	set,
	onValue,
	remove,
	get,
	child,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

const createServerBtn = document.getElementById('createServerBtn')
const serverNameInput = document.getElementById('serverName')
const serverListEl = document.getElementById('serverList')

// Данные игрока
let playerUid = localStorage.getItem('playerUid')
let playerName = localStorage.getItem('playerName')
let isGuest = localStorage.getItem('isGuest') === 'true'
let myServerKey = null

// === Проверка, играет ли пользователь, до рендера страницы ===
async function checkIsPlaying() {
	if (!playerUid) return
	const snap = await get(ref(db, `users/${playerUid}/isPlaying`))
	if (snap.val() === true) {
		window.location.href = 'game.html'
	}
}
checkIsPlaying()

// === Функция рендера серверов ===
function renderServers(serversData) {
	serverListEl.innerHTML = ''

	for (const [serverKey, server] of Object.entries(serversData || {})) {
		const li = document.createElement('li')
		const isConnected = server.players && server.players[playerUid]
		li.style.background = isConnected ? '#8FBC8F' : '#FFDDA0'

		const title = document.createElement('div')
		title.textContent = `${server.name} (${
			Object.keys(server.players || {}).length
		}/${server.maxPlayers || 2})`
		li.appendChild(title)

		const playersDiv = document.createElement('div')
		playersDiv.className = 'players'

		for (const [uid, name] of Object.entries(server.players || {})) {
			const playerItem = document.createElement('div')
			playerItem.className = 'player-item'

			const nameSpan = document.createElement('span')
			let displayName = name
			if (uid === server.owner) displayName += ' (host)'
			nameSpan.textContent = displayName
			playerItem.appendChild(nameSpan)

			const readyCheckbox = document.createElement('input')
			readyCheckbox.type = 'checkbox'
			if (server.ready && server.ready[uid]) readyCheckbox.checked = true
			if (uid !== playerUid) readyCheckbox.disabled = true
			readyCheckbox.onchange = async () => {
				await set(
					ref(db, `servers/${serverKey}/ready/${playerUid}`),
					readyCheckbox.checked
				)
			}
			playerItem.appendChild(readyCheckbox)
			playersDiv.appendChild(playerItem)
		}
		li.appendChild(playersDiv)

		const btn = document.createElement('button')
		if (isConnected) {
			btn.textContent = 'Отключиться'
			btn.onclick = async () => {
				await remove(ref(db, `servers/${serverKey}/players/${playerUid}`))
				await remove(ref(db, `servers/${serverKey}/ready/${playerUid}`))

				const playersSnapshot = await get(
					ref(db, `servers/${serverKey}/players`)
				)
				const players = playersSnapshot.val() || {}

				if (Object.keys(players).length === 0) {
					await remove(ref(db, `servers/${serverKey}`))
				} else if (server.owner === playerUid) {
					const nextOwner = Object.keys(players)[0]
					await set(ref(db, `servers/${serverKey}/owner`), nextOwner)
				}
				myServerKey = null
			}
		} else {
			btn.textContent = 'Подключиться'
			btn.disabled = !!myServerKey
			btn.onclick = async () => {
				if (myServerKey)
					return alert('Вы уже подключены к серверу. Сначала отключитесь.')

				await set(
					ref(db, `servers/${serverKey}/players/${playerUid}`),
					playerName
				)
				await set(ref(db, `servers/${serverKey}/ready/${playerUid}`), false)
				myServerKey = serverKey
				if (!server.owner)
					await set(ref(db, `servers/${serverKey}/owner`), playerUid)
			}
		}
		li.appendChild(btn)

		// === Кнопка начать игру (только для хоста) ===
		const startBtn = document.createElement('button')
		startBtn.textContent = 'Начать игру'

		const allReady =
			server.ready &&
			Object.keys(server.ready).length === server.maxPlayers &&
			Object.values(server.ready).every(Boolean)

		startBtn.disabled = !isConnected || playerUid !== server.owner || !allReady

		startBtn.onclick = async () => {
			await set(ref(db, `servers/${serverKey}/start`), true)

			const playerUids = Object.keys(server.players || {})

			// isPlaying = true и playingWith
			if (playerUids.length === 2) {
				const [uid1, uid2] = playerUids
				await set(ref(db, `users/${uid1}/isPlaying`), true)
				await set(ref(db, `users/${uid2}/isPlaying`), true)

				await set(ref(db, `users/${uid1}/playingWith`), uid2)
				await set(ref(db, `users/${uid2}/playingWith`), uid1)
			}

			localStorage.setItem('myServerKey', serverKey)
			window.location.href = 'game.html'
		}
		li.appendChild(startBtn)

		const statusDiv = document.createElement('div')
		statusDiv.className = 'status'
		const numPlayers = Object.keys(server.players || {}).length

		if (numPlayers < server.maxPlayers) {
			statusDiv.textContent = 'Ждем больше игроков'
			statusDiv.style.color = 'gray'
		} else if (!allReady) {
			statusDiv.textContent = 'Ждем когда все будут готовы'
			statusDiv.style.color = 'orange'
		} else {
			statusDiv.textContent = 'Все готовы — ждём хоста'
			statusDiv.style.color = 'green'
		}

		li.appendChild(statusDiv)
		serverListEl.appendChild(li)
	}
}

// === Слежение за изменениями серверов ===
onValue(ref(db, 'servers'), async snapshot => {
	let serversData = snapshot.val() || {}

	for (const [key, server] of Object.entries(serversData)) {
		if (!server.players || Object.keys(server.players).length === 0) {
			await remove(ref(db, `servers/${key}`))
			delete serversData[key]
		}

		// если кто-то уже играет, редиректим
		if (server.start && server.players && server.players[playerUid]) {
			localStorage.setItem('myServerKey', key)
			window.location.href = 'game.html'
			return
		}
	}

	myServerKey = null
	for (const [key, server] of Object.entries(serversData)) {
		if (server.players && server.players[playerUid]) {
			myServerKey = key
			break
		}
	}

	renderServers(serversData)
})

// === Создание нового сервера ===
createServerBtn.onclick = async () => {
	const name = serverNameInput.value.trim()
	if (!name) return alert('Введите название сервера')
	if (myServerKey) return alert('Вы уже подключены к серверу.')

	const snapshot = await get(child(ref(db), 'servers'))
	const serversData = snapshot.val() || {}
	for (const server of Object.values(serversData)) {
		if (server.name === name) return alert('Такой сервер уже есть')
	}

	const newServerRef = ref(db, `servers/${Date.now()}`)
	await set(newServerRef, {
		name,
		maxPlayers: 2,
		players: { [playerUid]: playerName },
		owner: playerUid,
		ready: { [playerUid]: false },
		start: false,
	})
	myServerKey = newServerRef.key
}
