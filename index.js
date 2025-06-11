process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const axios = require('axios');

const BASE_URL = 'https://testamsupload.apa.sk/apiv2';
const COOKIE = 'cookiesession1=678A3E1376595D1C1F8B4943512E07A5';

const headers = {
    'Accept': 'application/json'
};

let token = '';
let createdUserUuid = '';
let magicCode = '';

async function login() {
    const res = await axios.post(`${BASE_URL}/oauth/token`, {
        grant_type: 'password',
        username: '999006',
        password: 'BH41Zp8p3D'
    }, {
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        }
    });

    token = res.data.access_token;
    console.log('✅ Login OK');
}

async function loginMagic() {
    const res = await axios.post(`${BASE_URL}/oauth/token`, {
        grant_type: 'password',
        magic_token: magicCode,
    }, {
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        }
    });

    token = res.data.access_token;
    console.log('✅ Login OK');
}

async function getMe() {
    const res = await axios.get(`${BASE_URL}/me`, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`
        }
    });
    console.log('✅ /me OK', res.data);
}

async function getAreas() {
    const res = await axios.get(`${BASE_URL}/areas`, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`
        }
    });
    console.log('✅ /areas OK', res.data, 'areas');
}

async function createUser() {
    const res = await axios.post(`${BASE_URL}/users/create`, {
        note: 'Poznamka',
        first_name: 'Meno',
        last_name: 'Priezvisko'
    }, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    createdUserUuid = res.data.uuid;
    magicCode = res.data.magic_code;
    console.log('✅ User created', res.data);
}

async function listUsers() {
    const res = await axios.get(`${BASE_URL}/users`, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`
        }
    });
    if(res.data.find(item => item.uuid === createdUserUuid)) {
        console.log('✅ /users OK');
    } else {
        console.error('❌ Created user not found in /users response');
    }
}

async function updateUser() {
    if (!createdUserUuid) return;
    const res = await axios.post(`${BASE_URL}/users/update`, {
        uuid: createdUserUuid,
        first_name: 'Jano',
        last_name: 'Traktorista',
        note: 'Note for secondary user'
    }, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    console.log('✅ User updated');
}

async function deleteUser() {
    if (!createdUserUuid) return;
    await axios.post(`${BASE_URL}/users/delete`, [createdUserUuid], {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    console.log('✅ User deleted');
}

async function logout() {
    await axios.post(`${BASE_URL}/oauth/logout`, null, {
        headers: {
            ...headers,
            Authorization: `Bearer ${token}`
        }
    });
    console.log('✅ Logout OK');
}

async function runAll() {
    try {
        await login();
        await getMe();
        await getAreas();
        await createUser();
        await listUsers();
        await updateUser();
        await loginMagic();
        await deleteUser();
        await logout();
    } catch (err) {
        console.error('❌ Error during request: ', err.request._currentUrl || err.request.path, err.response?.data || err.message);
    }
}

runAll();
