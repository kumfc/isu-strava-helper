// ==UserScript==
// @name         ISU Strava Helper
// @version      0.2
// @description  blabla
// @author       umfc
// @match        https://isu.ifmo.ru/*
// @grant        GM_xmlhttpRequest
// @connect      strava.com
// ==/UserScript==

Object.prototype[Symbol.iterator] = function() { //шизофрения
    var keys = [];
    var ref = this;
    for (var key in this) {
        keys.push(key);
    }
    return {
        next: function() {
            if (this._keys && this._obj && this._index < this._keys.length) {
                var key = this._keys[this._index];
                this._index++;
                return {value: key, done: false};
            } else {
                return {done: true};
            }
        },
        _index: 0,
        _keys: keys,
        _obj: ref
    };
};

unsafeWindow.strava = async () => {
    let users = {},
        userdata = {},
        u_el_arr,
        phys_app = false;

    if(String(unsafeWindow.document.location).includes('?p=2153:')){
        phys_app = true;
        u_el_arr = Array.from(unsafeWindow.document.querySelectorAll("a[href^='https://isu.ifmo.ru/pls/apex/f?p=2153:19:']"));
    } else {
        u_el_arr = Array.from(unsafeWindow.document.querySelectorAll('td[headers=ФИО]'));
    }

    for (const e of u_el_arr) {
        let el;
        if(phys_app){
            el = e.parentElement;
        } else {
            el = e; // чел ты
        }
        let user_url = el.children[0].href;
        let user_pid = user_url.match(':([0-9]{6})$')[1];
        if(phys_app){
            let session_id = user_url.match('2153:19:([0-9]+):')[1];
            user_url = `https://isu.ifmo.ru/pls/apex/f?p=2143:PERSON:${session_id}::NO:RP:PID:${user_pid}`;
        }
        await unsafeWindow.$.get(user_url, function(profile){
            let strava_url = profile.match('{"skype":{"data":{"text":"(.*?)"');
            if(!strava_url){
                console.log(`User ${user_pid} hasn\'t specified strava url in his profile!`);
            } else {
                strava_url = strava_url[1];
                users[user_pid] = {'strava_url': strava_url, 'element': el};
                console.log(`${user_pid}: ${strava_url}`);
            }
        });
    }

    for (const pid of users) {
        let strava_profile = await corsRequest('GET', users[pid].strava_url);
        try {
            let data = JSON.parse(strava_profile.match('<div data-react-class="AthleteProfileApp" data-react-props="(.*?)">')[1].replaceAll('&quot;', '"'));
            userdata[pid] = {'name': data.athlete.name, 'activity': [], 'valid_count': 0}
            for (const activity of data.recentActivities){
                let date = parseDate(activity.startDateLocal);
                if(thisWeek(date)){
                    if(activity.type == 'run' && parseDist(activity.distance) >= 3){
                        activity.valid = 'да';
                        userdata[pid].valid_count++;
                    } else if (activity.type == 'ride' && parseDist(activity.distance) >= 5){
                        activity.valid = 'да';
                        userdata[pid].valid_count++;
                    } else {
                        activity.valid = 'нет';
                    }
                    activity.parsed = `Дата: ${activity.startDateLocal}EOLТип: ${activity.type}EOLДистанция: ${activity.distance}EOLУдовлетворяет условиям: ${activity.valid}EOL`;
                    userdata[pid].activity.push(activity);
                }
            }
        } catch(e) {
            console.log(`Error while parsing strava profile of user ${pid}: ${e}`)
        }
    }

    for (const pid of users) {
        let parsed = `Имя: ${userdata[pid].name}`
        for (const activity of userdata[pid].activity){
            parsed += `EOL============================EOL${activity.parsed}`
        }

        let e = users[pid].element;
        e.innerHTML += ' ';
        e.appendChild(createElement(parsed));
        e.innerHTML += ' ' + userdata[pid].valid_count;
    }
}

function parseDist(dist){
    return parseFloat(dist.replace(',', '.'));
}

function corsRequest(method, url) {
    return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            method: method,
            url: url,
            onload: (response) => {
                resolve(response.responseText);
            },
            onerror: (response) => {
                reject({
                    status: response.status
                });
            }
        })
    });
}

function createElement(data){
    let el = unsafeWindow.document.createElement('img');
    el.setAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAABvUExURf9JAP9LAP9nAP9dAP9kAP9fAf9QAP9TAP9NAP9WAP9aAP9rAP9oIf+PUf////+qg/9HAP+DSv+yiv9lFf96NP/Rt//w6P/49P+QXv9fFf+jeP+ebf/i0v9pCP+COf+7mP/n3P/Epf/Suf+8nP91Ktrc2ToAAACXSURBVBjTPY7ZAoMgDAQjISDKUe+qvfv//9hAtLzNZEMW2rZVSmsibBrnrAFhdUcszKLMQ4+ucA2F1TSPwiyYMSzxKVxB/k9PMc5jYRZETVhu7/i1eQ7A9/Qn7n5eRsgMfP9xmwbqX2m1WSA6GsiGzXfbemEh/YxP3X4tK8K1CX3yOQBnnyFJAM4+VScBOBjASACOfv/3A7a2CDJ8OAHHAAAAAElFTkSuQmCC');
    el.style = 'height: 13px;';
    el.setAttribute('onclick', `alert('${data}'.replaceAll('EOL', '\\n'))`);
    return el;
}

function parseDate(date){
    let months = {'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'};
    for (const month of months){
        date = date.replace(month, months[month]);
    }
    date = date.replace(' г.', '').split(' ');
    date = Date.parse(`${date[1]}/${date[0]}/${date[2]}`) / 1000 + 3600 * 3;
    return date;
}

function thisWeek(date){
    let current = new Date();
    current.setUTCHours(0, 0, 0, 0);
    let week_start = Date.parse(current) / 1000 - (current.getUTCDay() - 1) * 86400;
    return date >= week_start;
}