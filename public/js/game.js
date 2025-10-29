import { db } from './firebase-config.js'
import {
	ref,
	get,
	set,
	onValue,
	remove,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

const playerUid = localStorage.getItem('playerUid')
const myServerKey = localStorage.getItem('myServerKey')
const endGameBtn = document.getElementById('endGameBtn')

// Проверка, играет ли игрок
async function checkIsPlaying() {
	if (!playerUid || !myServerKey) {
		window.location.href = 'index.html'
		return
	}

	const snap = await get(ref(db, `users/${playerUid}/isPlaying`))
	if (!snap.val()) {
		window.location.href = 'index.html'
		return
	}

	// Подписка на изменения isPlaying — если станет false, выкидываем с game.html
	onValue(ref(db, `users/${playerUid}/isPlaying`), snap => {
		if (!snap.exists() || snap.val() === false) {
			localStorage.removeItem('myServerKey')
			window.location.href = 'servers.html'
		}
	})
}

// Завершение игры любым игроком
endGameBtn.addEventListener('click', async () => {
	try {
		const userRef = ref(db, `users/${playerUid}`)
		const snap = await get(userRef)
		const userData = snap.val()
		const partnerUid = userData?.playingWith

		// Обнуляем поля текущего игрока
		await set(ref(db, `users/${playerUid}/isPlaying`), false)
		await set(ref(db, `users/${playerUid}/playingWith`), null)

		// Обнуляем поля напарника
		if (partnerUid) {
			await set(ref(db, `users/${partnerUid}/isPlaying`), false)
			await set(ref(db, `users/${partnerUid}/playingWith`), null)
		}

		if (myServerKey) {
			// Обнуляем start у сервера
			await set(ref(db, `servers/${myServerKey}/start`), false)

			// Удаляем игроков из сервера
			await set(ref(db, `servers/${myServerKey}/players/${playerUid}`), null)
			if (partnerUid) {
				await set(ref(db, `servers/${myServerKey}/players/${partnerUid}`), null)
			}

			// Проверяем, остались ли игроки
			const serverSnap = await get(ref(db, `servers/${myServerKey}/players`))
			const playersLeft = serverSnap.val() || {}
			if (Object.keys(playersLeft).length === 0) {
				await remove(ref(db, `servers/${myServerKey}`))
			}
		}

		localStorage.removeItem('myServerKey')
		window.location.href = 'servers.html'
	} catch (err) {
		console.error('Ошибка при завершении игры:', err)
	}
})

// Старт проверки
checkIsPlaying()
