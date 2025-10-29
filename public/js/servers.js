import { db, auth, signInAsGuest } from './firebase-config.js'
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

function renderServers(serversData) {
	serverListEl.innerHTML = ''

	for (const [serverKey, server] of Object.entries(serversData || {})) {
		const li = document.createElement('li')
		const isConnected = server.players && server.players[playerUid]

		li.style.background = isConnected ? '#8FBC8F' : '#FFDDA0'

		// Название сервера
		const title = document.createElement('div')
		title.textContent = `${server.name} (${
			Object.keys(server.players || {}).length
		}/${server.maxPlayers || 2})`
		li.appendChild(title)

		// Список игроков с чекбоксами
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

		// Кнопка подключения/отключения
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

		// Кнопка начать игру
		const startBtn = document.createElement('button')
		startBtn.textContent = 'Начать игру'
		const allReady =
			server.ready &&
			Object.keys(server.ready).length === server.maxPlayers &&
			Object.values(server.ready).every(Boolean)
		startBtn.disabled = !isConnected || playerUid !== server.owner || !allReady
		startBtn.onclick = () => alert('Игра стартует!')
		li.appendChild(startBtn)

		// Статус сервера
		const statusDiv = document.createElement('div')
		statusDiv.className = 'status'

		const numPlayers = Object.keys(server.players || {}).length
		if (numPlayers < server.maxPlayers) {
			statusDiv.textContent = 'Ждем больше игроков'
			statusDiv.style.color = 'gray'
		} else if (!allReady) {
			statusDiv.textContent = 'Ждем когда все игроки будут готовы'
			statusDiv.style.color = 'orange'
		} else {
			statusDiv.textContent = 'Ждем когда хост начнет игру'
			statusDiv.style.color = 'green'
		}

		li.appendChild(statusDiv)
		serverListEl.appendChild(li)
	}
}

// Слежение за изменениями серверов
const serversRef = ref(db, 'servers')
onValue(serversRef, async snapshot => {
	let serversData = snapshot.val() || {}

	// Удаляем пустые серверы
	for (const [key, server] of Object.entries(serversData)) {
		if (!server.players || Object.keys(server.players).length === 0) {
			await remove(ref(db, `servers/${key}`))
			delete serversData[key]
		}
	}

	// Обновляем myServerKey
	myServerKey = null
	for (const [key, server] of Object.entries(serversData)) {
		if (server.players && server.players[playerUid]) {
			myServerKey = key
			break
		}
	}

	renderServers(serversData)
})

// Создание нового сервера
createServerBtn.onclick = async () => {
	const name = serverNameInput.value.trim()
	if (!name) return alert('Введите название сервера')
	if (myServerKey)
		return alert('Вы уже подключены к серверу. Сначала отключитесь.')

	const snapshot = await get(child(ref(db), 'servers'))
	const serversData = snapshot.val() || {}
	for (const server of Object.values(serversData)) {
		if (server.name === name)
			return alert('Сервер с таким названием уже существует')
	}

	const newServerRef = ref(db, `servers/${Date.now()}`)
	await set(newServerRef, {
		name: name,
		maxPlayers: 2,
		players: {
			[playerUid]: playerName,
		},
		owner: playerUid,
		ready: {
			[playerUid]: false,
		},
	})
	myServerKey = newServerRef.key
}
