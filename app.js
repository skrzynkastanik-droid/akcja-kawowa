let historia = []
let numerRundy = 1

const kawosze = [
    { imie: "Iza", wylosowany: false, urlop: false },
    { imie: "Justyna", wylosowany: false, urlop: false },
    { imie: "Marta", wylosowany: false, urlop: false },
    { imie: "Marcin", wylosowany: false, urlop: false },
    { imie: "Tomasz", wylosowany: false, urlop: false },
    { imie: "Krzysztof", wylosowany: false, urlop: false },
]

function rysujListe() {
    const lista = document.getElementById("lista")
    lista.innerHTML = ""
    kawosze.forEach(function (osoba) {
        const li = document.createElement("li")

        const span = document.createElement("span")
        span.textContent = osoba.urlop ? osoba.imie + " 🌴" : osoba.imie

        if (osoba.urlop) {
            li.className = "urlop"
        } else if (osoba.wylosowany) {
            li.className = "wylosowany"
        }

        const przyciskUrlop = document.createElement("button")
        przyciskUrlop.textContent = osoba.urlop ? "Wróć" : "🌴"
        przyciskUrlop.className = "btn-urlop"
        przyciskUrlop.addEventListener("click", function () {
            osoba.urlop = !osoba.urlop
            localStorage.setItem("kawosze", JSON.stringify(kawosze))
            rysujListe()
        })

        li.appendChild(span)

        if (osoba.wylosowany && !osoba.urlop) {
            const chip = document.createElement("span")
            chip.textContent = "✓ wylosowany"
            chip.className = "chip"
            li.appendChild(chip)
        }

        li.appendChild(przyciskUrlop)
        lista.appendChild(li)
    })
}

function rysujHistorie() {
    const kontener = document.getElementById("historia")
    kontener.innerHTML = ""
    const od = numerRundy - 2
    const przefiltrowana = historia.filter(function (wpis) {
        return wpis.runda >= od
    })
    przefiltrowana.forEach(function (wpis) {
        const div = document.createElement("div")
        div.textContent = "R" + wpis.runda + " | " + wpis.imie + " | " + wpis.data
        kontener.appendChild(div)
    })
}

const przyciskLosuj = document.getElementById("losuj")
const przyciskResetuj = document.getElementById("resetuj")
const przyciskNowagra = document.getElementById("nowa-gra")

przyciskLosuj.addEventListener("click", function () {
    const dostepni = kawosze.filter(function (osoba) {
        return osoba.wylosowany === false && osoba.urlop === false
    })
    if (dostepni.length === 0) {
        document.getElementById("wynik").textContent = "Wszyscy wylosowani!"
        localStorage.setItem("wynik", "Wszyscy wylosowani!")
        return
    }
    przyciskLosuj.disabled = true
    przyciskResetuj.disabled = true
    const pasek = document.getElementById("pasek")
    pasek.style.width = "0%"
    setTimeout(function () {
        pasek.style.width = "100%"
    }, 50)
    const miganie = setInterval(function () {
        const losowyIndeks = Math.floor(Math.random() * dostepni.length)
        document.getElementById("wynik").textContent = dostepni[losowyIndeks].imie
    }, 150)
    setTimeout(function () {
        clearInterval(miganie)
        const indeks = Math.floor(Math.random() * dostepni.length)
        const wylosowana = dostepni[indeks]
        document.getElementById("wynik").textContent = wylosowana.imie
        wylosowana.wylosowany = true
        historia.push({
            imie: wylosowana.imie,
            data: new Date().toLocaleString("pl-PL"),
            runda: numerRundy
        })
        localStorage.setItem("historia", JSON.stringify(historia))
        rysujHistorie()
        localStorage.setItem("kawosze", JSON.stringify(kawosze))
        localStorage.setItem("wynik", wylosowana.imie)
        rysujListe()
        pasek.style.width = "0%"
        przyciskLosuj.disabled = false
        przyciskResetuj.disabled = false
    }, 3000)
})

przyciskResetuj.addEventListener("click", function () {
    kawosze.forEach(function (osoba) {
        osoba.wylosowany = false
    })
    document.getElementById("wynik").textContent = ""
    localStorage.setItem("kawosze", JSON.stringify(kawosze))
    localStorage.setItem("wynik", "")
    rysujListe()
    numerRundy = numerRundy + 1
    document.getElementById("runda").textContent = "Runda: " + numerRundy
    localStorage.setItem("numerRundy", numerRundy)
})

przyciskNowagra.addEventListener("click", function () {
    kawosze.forEach(function (osoba) {
        osoba.wylosowany = false
        osoba.urlop = false
    })
    historia = []
    numerRundy = 1
    document.getElementById("wynik").textContent = ""
    document.getElementById("runda").textContent = "Runda: 1"
    localStorage.setItem("kawosze", JSON.stringify(kawosze))
    localStorage.setItem("wynik", "")
    localStorage.setItem("historia", JSON.stringify(historia))
    localStorage.setItem("numerRundy", 1)
    rysujListe()
    rysujHistorie()
})

const zapisane = localStorage.getItem("kawosze")
if (zapisane) {
    const wczytane = JSON.parse(zapisane)
    wczytane.forEach(function (osoba, indeks) {
        kawosze[indeks].wylosowany = osoba.wylosowany
        kawosze[indeks].urlop = osoba.urlop
    })
    rysujListe()
} else {
    rysujListe()
}

const zapisanyWynik = localStorage.getItem("wynik")
if (zapisanyWynik) {
    document.getElementById("wynik").textContent = zapisanyWynik
}

const zapisanaRunda = localStorage.getItem("numerRundy")
if (zapisanaRunda) {
    numerRundy = parseInt(zapisanaRunda)
    document.getElementById("runda").textContent = "Runda: " + numerRundy
}

const zapisanaHistoria = localStorage.getItem("historia")
if (zapisanaHistoria) {
    historia = JSON.parse(zapisanaHistoria)
    rysujHistorie()
}
