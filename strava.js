// ==UserScript==
// @name         ISU Strava Helper
// @version      1.5
// @description  blabla
// @author       umfc
// @match        https://isu.ifmo.ru/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      strava.com
// @connect      cdn-1.strava.com
// ==/UserScript==

const magic = undefined;
const date_start = new Date("2021-02-01");
const date_end = new Date("2021-03-01");

async function getToken(){
    if(GM_getValue('strava_token') === undefined || GM_getValue('strava_token') === ''){
        let data = JSON.parse(await corsRequest('POST', 'https://cdn-1.strava.com/api/v3/oauth/internal/token?hl=ru-RU', atob(magic), {'Content-Type': 'application/json; charset=UTF-8'}));
        GM_setValue('strava_token', data.access_token);
        return data.access_token;
    } else {
        let token = GM_getValue('strava_token');
        let check_data = await getAthleteProfile('35397727', token);
        if(check_data.message === 'Authorization Error'){
            GM_setValue('strava_token', '');
            return await getToken()
        } else {
            return token;
        }
    }
}
unsafeWindow.test = getToken;

async function getAthleteProfile(id, token, dateBefore = undefined){
    let payload = `https://cdn-1.strava.com/api/v3/feed/athlete/${id}?photo_sizes%5B%5D=540&hl=ru-RU`;
    if(dateBefore){
        payload += `&before=${dateBefore}`;
    }
    return JSON.parse(await corsRequest('GET', payload, '', {'Authorization': `access_token ${token}`}))
}

async function parseStravaWithApi(users){
    let token = await getToken(),
        userdata = {};

    for (const pid of users) {
        console.log(`Parsing strava profile of student ${pid}`);

        try{
            if(!users[pid].strava_id){
                users[pid].strava_id = await resolveStravaHandle(users[pid].strava_url);
            }
        } catch (e) {
            console.log(`Strava handle resolving problems while parsing strava profile of student ${pid}`);
        }

        let activities = await getAthleteProfile(users[pid].strava_id, token);
        let date_break = false,
            last_activity_date = 0;

        userdata[pid] = {'activity': [], 'valid_count': 0, 'valid_count_overall': 0, 'valid_ride_count_by_date': {}, 'valid_ride_count_by_week': {}, 'valid_run_count_by_date': {}, 'valid_run_count_by_week': {}};

        while(activities.length > 0 && !date_break){
            // console.log(activities);
            for (const activity of activities){
                let data = activity.item;
                let time = Date.parse(data.start_date) / 1000;
                let date = new Date(data.start_date).toISOString().slice(0,10);
                let weekNumber = getWeekNumber(data.start_date);
                let kmMin = Number(((data.moving_time / 60) / (data.distance / 1000)).toFixed(1));
                if(time < Date.parse(date_start) / 1000){
                    date_break = true;
                    break;
                }
                data.start_date = time;
                if(data.type == 'Ride' && data.distance >= 5000 && kmMin > 3 && kmMin < 6 && !userdata[pid].valid_ride_count_by_date[date] && (!userdata[pid].valid_ride_count_by_week[weekNumber] || userdata[pid].valid_ride_count_by_week[weekNumber] < 3)){
                    data.valid = 'да';
                    userdata[pid].valid_count_overall++;
                    userdata[pid].valid_ride_count_by_date[date] = 1;
                    
                    if(userdata[pid].valid_ride_count_by_week[weekNumber]){
                        userdata[pid].valid_ride_count_by_week[weekNumber] += 1;
                    } else {
                        userdata[pid].valid_ride_count_by_week[weekNumber] = 1;
                    }
                    
                    if(inAWeek(time)){
                        userdata[pid].valid_count++;
                    }
                } else if (data.type == 'Run' && data.distance >= 3000 && kmMin > 4.5 && kmMin < 8 && !userdata[pid].valid_run_count_by_date[date] && (!userdata[pid].valid_run_count_by_week[weekNumber] || userdata[pid].valid_run_count_by_week[weekNumber] < 3)){
                    data.valid = 'да';
                    userdata[pid].valid_count_overall++;
                    userdata[pid].valid_run_count_by_date[date] = 1;
                    
                    if(userdata[pid].valid_run_count_by_week[weekNumber]){
                        userdata[pid].valid_run_count_by_week[weekNumber] += 1;
                    } else {
                        userdata[pid].valid_run_count_by_week[weekNumber] = 1;
                    }
                    
                    if(inAWeek(time)){
                        userdata[pid].valid_count++;
                    }
                } else {
                    data.valid = 'нет';
                }
                data.parsed = `<b>Дата:</b> ${formatDateFromUnixtime(data.start_date * 1000)}<br><b>Тип:</b> ${data.type}<br><b>Дистанция:</b> ${(data.distance / 1000).toFixed(1)} км<br><b>Время:</b> ${(data.moving_time / 60).toFixed(1)} минут<br><b>Минут на 1 км:</b> ${kmMin}<br><b>Удовлетворяет условиям:</b> ${data.valid}`;
                userdata[pid].activity.push(data);
                last_activity_date = data.start_date;
            }
            activities = await getAthleteProfile(users[pid].strava_id, token, last_activity_date);
        }
    }

    return userdata;
}

function getWeekNumber(d){
    d = new Date(d);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return `${weekNo}/${d.getUTCFullYear()}`;
}

function formatDateFromUnixtime(unixtime){
    let d = new Date(unixtime);
    return d.toLocaleString('default', {year: 'numeric', month: 'long', day: 'numeric'});
}

unsafeWindow.strava = async (exportCsv = false, csvName = 'export.csv') => {
    if(magic === undefined){
        return console.log('Magic variable is not defined!');
    }

    let users = {},
        userdata = {};

    users = await parseStudents();
    userdata = await parseStravaWithApi(users);

    for (const pid of users) {
        if(userdata[pid] === undefined){
            continue;
        }
        let parsed = `<h4>Удовлетворяющих условиям тренировок</h4><b>В течение этой недели:</b> ${userdata[pid].valid_count}<br><b>В течение заданного периода:</b> ${userdata[pid].valid_count_overall}`;
        for (const activity of userdata[pid].activity){
            parsed += `<hr>${activity.parsed}`
        }

        let e = users[pid].element;
        e.innerHTML += '  ';
        e.appendChild(createStravaIconElement(parsed));
        e.innerHTML += ' ' + userdata[pid].valid_count + ' | ' + userdata[pid].valid_count_overall;
    }

    if(exportCsv){
        let dates = generateDates(date_start, date_end);
        let csvContent = 'data:text/csv;charset=utf-8,\uFEFFТабельный номер;ФИО;' + dates.join(';') + ';Всего\r\n';
        for (const pid of users) {
            csvContent += `${pid};${users[pid].name};`;
            for (const date of dates){
                let valid_by_date = 0;
                
                if(userdata[pid].valid_ride_count_by_date[date]){
                    valid_by_date += userdata[pid].valid_ride_count_by_date[date];
                }
                if(userdata[pid].valid_run_count_by_date[date]){
                    valid_by_date += userdata[pid].valid_run_count_by_date[date];
                }
                
                csvContent += valid_by_date * 5 + ';';
            }
            csvContent += `${userdata[pid].valid_count_overall * 5}\r\n`;
        }

        let link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', csvName);
        link.setAttribute('style', 'display: hidden;');
        document.body.appendChild(link);
        link.click();
    }
}

// Deprecated section
async function isSignedInToStrava(){
    let onboarding_page = await corsRequest('GET', 'https://www.strava.com/onboarding');
    return !onboarding_page.includes('Вход через эл. почту');
}

async function parseStravaNoAuth(users){
    let userdata = {};
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
                    activity.parsed = `Дата: ${activity.startDateLocal}<br>Тип: ${activity.type}<br>Дистанция: ${activity.distance}<br>Удовлетворяет условиям: ${activity.valid}<br>`;
                    userdata[pid].activity.push(activity);
                }
            }
        } catch(e) {
            console.log(`Error while parsing strava profile of user ${pid}: ${e}`)
        }
    }
    return userdata;
}
// Deprecated section end

async function parseStudents(){
    let users = {},
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
        let user_name = el.children[0].innerHTML;
        let user_pid = user_url.match(':([0-9]{6})$');
        if(user_pid){
            user_pid = user_pid[1];
        } else {
            continue;
        }
        if(phys_app){
            let session_id = user_url.match('2153:19:([0-9]+):');
            if(session_id){
                session_id = session_id[1];
            } else {
                continue;
            }
            user_url = `https://isu.ifmo.ru/pls/apex/f?p=2143:PERSON:${session_id}::NO:RP:PID:${user_pid}`;
        }
        await unsafeWindow.$.get(user_url, function(profile){
            //let strava_url = profile.match('"skype":{"data":{"text":"(.*?)"');
            let strava_url = profile.match('(strava\.com\/athletes\/[0-9a-z]+)');
            if(!strava_url){
                console.log(`Student ${user_pid} hasn\'t specified strava url in his profile!`);
            } else {
                strava_url = `https://www.${strava_url[1]}`;
                let strava_handle = strava_url.match('athletes/([0-9a-z]+)');
                if(!strava_handle){
                    console.log(`Student ${user_pid} has specified incorrect strava url in his profile!`);
                } else {
                    let strava_id;
                    strava_handle = strava_handle[1];
                    if(!strava_handle.match('^[0-9]+$')){
                        strava_id = 0;
                    } else {
                        strava_id = strava_handle;
                    }
                    users[user_pid] = {'strava_url': strava_url, 'strava_id': strava_id, 'element': el, 'name': user_name};
                    console.log(`${user_pid}: ${strava_url}`);
                }
            }
        });
    }
    return users;
}

async function resolveStravaHandle(url){
    let resp = await corsRequest('GET', url);
    return resp.match('<meta content=\'https:\/\/www.strava.com\/athletes\/([0-9]+)\'')[1];
}

function createStravaIconElement(data){
    let el = unsafeWindow.document.createElement('img');
    el.setAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAABvUExURf9JAP9LAP9nAP9dAP9kAP9fAf9QAP9TAP9NAP9WAP9aAP9rAP9oIf+PUf////+qg/9HAP+DSv+yiv9lFf96NP/Rt//w6P/49P+QXv9fFf+jeP+ebf/i0v9pCP+COf+7mP/n3P/Epf/Suf+8nP91Ktrc2ToAAACXSURBVBjTPY7ZAoMgDAQjISDKUe+qvfv//9hAtLzNZEMW2rZVSmsibBrnrAFhdUcszKLMQ4+ucA2F1TSPwiyYMSzxKVxB/k9PMc5jYRZETVhu7/i1eQ7A9/Qn7n5eRsgMfP9xmwbqX2m1WSA6GsiGzXfbemEh/YxP3X4tK8K1CX3yOQBnnyFJAM4+VScBOBjASACOfv/3A7a2CDJ8OAHHAAAAAElFTkSuQmCC');
    el.style = 'height: 13px;';
    el.setAttribute('onclick', `$('<div title="Информация о тренировках">${data}</div>').dialog({width: '40%', height: ($(window).height() - 200), resizable: false, draggable: false});`);
    return el;
}

function parseDist(dist){
    return parseFloat(dist.replace(',', '.'));
}

function corsRequest(method, url, data = '', headers = {}) {
    return new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            method: method,
            url: url,
            data: data,
            headers: headers,
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

function generateDates(start, end){
    for(var arr=[], dt=new Date(start); dt<=end; dt.setDate(dt.getDate()+1)){
        arr.push(new Date(dt));
    }
    return arr.map((v)=>v.toISOString().slice(0,10));
}

function parseDate(date){
    let months = {'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'};
    if(date == 'Сегодня'){
        let d = new Date();
        return d.setUTCHours(0, 0, 0, 0);
    }
    if(date == 'Вчера'){
        let d = new Date();
        return d.setUTCDate(d.getUTCDate() - 1);
    }
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
    let week_start = Date.parse(current) / 1000 - ((current.getUTCDay() + 7) % 8 - 1) * 86400;
    return date >= week_start;
}

function inAWeek(date){
    let current = new Date();
    current.setUTCHours(0, 0, 0, 0);
    let week_ago = Date.parse(current) / 1000 - 7 * 86400;
    return date >= week_ago;
}

Object.prototype[Symbol.iterator] = function() {
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
