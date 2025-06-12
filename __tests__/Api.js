process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const request = require('supertest');
const path = require('path');
const baseURL = process.env.BASE_URL;

let primaryToken;
let secondaryToken;
let secondaryUser;

beforeAll(async () => {
    // Obtain primary user token
    const primaryRes = await request(baseURL)
        .post('/oauth/token')
        .send({ grant_type: 'password', username: process.env.USERNAME, password: process.env.PASSWORD });
    expect(primaryRes.status).toBe(200);
    primaryToken = primaryRes.body.access_token;

    //create secondary user for testing purposes
    const createRes = await request(baseURL)
        .post('/users/create')
        .set('Authorization', `Bearer ${primaryToken}`)
        .send({ first_name: 'Test', last_name: 'User', note: 'Note' });

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('uuid');
    secondaryUser = createRes.body
});

describe('User & Areas Endpoints', () => {
    test('GET /me - happy path primary user', async () => {
        const res = await request(baseURL)
            .get('/me')
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        ['user_id', 'type', 'first_name', 'last_name', 'company_name', 'business_id', 'ppa_id', 'request_number'].forEach(field => {
            expect(res.body).toHaveProperty(field);
        });

        expect(res.body.type).toBe('primary');

    });

    test('GET /areas - happy path', async () => {
        const res = await request(baseURL)
            .get('/areas')
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('areas');
        expect(Array.isArray(res.body.areas)).toBe(true);
    });
});

describe('Image Endpoints', () => {
    const exampleArea = 'a29df92da842291c1391aaf83496136d1bb589f1688cc49cc188bc810c681a53';
    const exampleFile = 'image1.jpg';
    const fixturePath = path.join(__dirname, 'fixtures', 'image.jpg');

    test('GET /photo/:area/:filename - happy path', async () => {
        const res = await request(baseURL)
            .get(`/photo/${exampleArea}/${exampleFile}`)
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
    });

    test('GET /photo/:area/:filename - not found returns 404', async () => {
        const res = await request(baseURL)
            .get(`/photo/${exampleArea}/nonexistent.jpg`)
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'not_found');
    });

    test('DELETE /photo/:area/:filename - unauthorized for secondary', async () => {
        const res = await request(baseURL)
            .delete(`/photo/${exampleArea}/${exampleFile}`)
            .set('Authorization', `Bearer ${secondaryToken}`);
        expect(res.status).toBe(401);
    });

    test('DELETE /photo/:area/:filename - happy path', async () => {
        const res = await request(baseURL)
            .delete(`/photo/${exampleArea}/${exampleFile}`)
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Image deleted successfully');
    });

    test('GET /photo/:area/thumb/:filename - happy path', async () => {
        const res = await request(baseURL)
            .get(`/photo/${exampleArea}/thumb/${exampleFile}`)
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
    });

    test('POST /photo/:area/upload - happy path', async () => {
        const res = await request(baseURL)
            .post(`/photo/${exampleArea}/upload`)
            .set('Authorization', `Bearer ${secondaryToken}`)
            .field('note', 'Test upload')
            .field('filename', exampleFile)
            .attach('file', fixturePath);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Image uploaded successfully');
    });

    test('POST /photo/:area/upload - missing file returns 400', async () => {
        const res = await request(baseURL)
            .post(`/photo/${exampleArea}/upload`)
            .set('Authorization', `Bearer ${secondaryToken}`)
            .field('note', 'No file')
            .field('filename', exampleFile);
        expect(res.status).toBe(400);
    });
});

describe('AMS Endpoints', () => {
    const exampleArea = 'a29df92da842291c1391aaf83496136d1bb589f1688cc49cc188bc810c681a53';

    test('POST /ams/:area/controls - happy path and conflict', async () => {
        const body = { crop: 950, culture: 2, first_operation_date: new Date().toISOString() };
        const first = await request(baseURL)
            .post(`/ams/${exampleArea}/controls`)
            .set('Authorization', `Bearer ${primaryToken}`)
            .send(body);
        expect(first.status).toBe(200);
        expect(first.body).toHaveProperty('message');

        const second = await request(baseURL)
            .post(`/ams/${exampleArea}/controls`)
            .set('Authorization', `Bearer ${primaryToken}`)
            .send(body);
        expect(second.status).toBe(409);
        expect(second.body).toHaveProperty('error', 'conflict');
    });

    test('POST /ams/:area/photo - happy path', async () => {
        const fixturePath = path.join(__dirname, 'fixtures', 'image.jpg');
        const res = await request(baseURL)
            .post(`/ams/${exampleArea}/photo`)
            .set('Authorization', `Bearer ${primaryToken}`)
            .field('note', 'AMS upload')
            .field('reason', 'ams')
            .field('filename', 'image1.jpg')
            .attach('file', fixturePath);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
    });

    test('POST /photo/:area/move-to-ams - happy path', async () => {
        const res = await request(baseURL)
            .post(`/photo/${exampleArea}/move-to-ams`)
            .set('Authorization', `Bearer ${primaryToken}`)
            .send({ filename: 'image1.jpg', reason: 'ams', note: 'Moving to AMS' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
    });

    test('POST /photo/:area/move-to-ams - missing fields returns 400', async () => {
        const res = await request(baseURL)
            .post(`/photo/${exampleArea}/move-to-ams`)
            .set('Authorization', `Bearer ${primaryToken}`)
            .send({ filename: 'image1.jpg' });
        expect(res.status).toBe(400);
    });
});

describe('User Management Endpoints', () => {
    test('POST /register - happy path for both users', async () => {
        for (const token of [primaryToken, secondaryToken]) {
            const res = await request(baseURL)
                .post('/register')
                .set('Authorization', `Bearer ${token}`)
                .send({ device_token: 'token123', platform: 'android' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('message', 'Device registered successfully');
        }
    });

    test('GET /outage - happy path', async () => {
        const res = await request(baseURL).get('/outage');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    let createdUserUuid

    test('POST /users/create', async () => {
        // Create
        const createRes = await request(baseURL)
            .post('/users/create')
            .set('Authorization', `Bearer ${primaryToken}`)
            .send({ first_name: 'Temp', last_name: 'User', note: 'Temp User Note' });
        expect(createRes.status).toBe(200);
        expect(createRes.body).toHaveProperty('uuid');

        const createdUser = createRes.body
        expect(createdUser.first_name).toBe('Temp');
        expect(createdUser.last_name).toBe('User');
        expect(createdUser.note).toBe('Temp User Note');

        createdUserUuid = createRes.body.uuid;
    });

    test('POST /users/update', async () => {
                // Update
        const updateRes = await request(baseURL)
            .post('/users/update')
            .set('Authorization', `Bearer ${primaryToken}`)
            .send({uuid: createdUserUuid, first_name: 'Edited Temp', last_name: 'Edited User', note: 'Edited Temp User Note' });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body).toHaveProperty('first_name', 'Test2');
    });

    test('GET /users - primary only', async () => {
        const primaryRes = await request(baseURL)
            .get('/users')
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(primaryRes.status).toBe(200);
        expect(Array.isArray(primaryRes.body)).toBe(true);
        const createdUser = primaryRes.body.find(u => u.uuid === secondaryUser.uuid);
        expect(createdUser.uuid).toBe(secondaryUser.uuid);
        expect(createdUser.first_name).toBe('Edited Temp');
        expect(createdUser.last_name).toBe('Edited ');
        expect(createdUser.note).toBe('Edited Temp User Note');

        const secondaryRes = await request(baseURL)
            .get('/users')
            .set('Authorization', `Bearer ${secondaryToken}`);
        expect(secondaryRes.status).toBe(401);
    });

    test('POST /users/delete', async () => {
        // Delete
        const deleteRes = await request(baseURL)
            .post('/users/delete')
            .set('Authorization', `Bearer ${primaryToken}`)
            .send([createdUserUuid]);
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body).toHaveProperty('message');
    });

    test('POST /users/log and GET /users/logs', async () => {
        // Log activity as secondary
        const logItem = {
            user: { uuid: 'fake-uuid', device: 'device-test' },
            date: new Date().toISOString(),
            operation: 'LOGIN'
        };
        const logRes = await request(baseURL)
            .post('/users/log')
            .set('Authorization', `Bearer ${secondaryToken}`)
            .send(logItem);
        expect(logRes.status).toBe(200);

        // Read logs as primary
        const readRes = await request(baseURL)
            .get('/users/logs')
            .set('Authorization', `Bearer ${primaryToken}`)
            .query({ page: 0, items_per_page: 5 });
        expect(readRes.status).toBe(200);
        expect(readRes.body).toHaveProperty('page_data');
        expect(readRes.body).toHaveProperty('log_data');
    });
});

describe('Auth Endpoints', () => {
    test('POST /oauth/token - invalid username returns 401', async () => {
        const res = await request(baseURL)
            .post('/oauth/token')
            .send({ grant_type: 'password', username: 'invalidusername', password: process.env.PASSWORD });
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'unauthorized');
    });

    test('POST /oauth/token - invalid password returns 401', async () => {
        const res = await request(baseURL)
            .post('/oauth/token')
            .send({ grant_type: 'password', username: process.env.USERNAME, password: 'invalidpassword' });
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'unauthorized');
    });

    test('POST /oauth/token - missing required fields returns 400', async () => {
        const res = await request(baseURL)
            .post('/oauth/token')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'unprocessable_entity');
    });

    test('POST /oauth/token - invalid grant type returns 400', async () => {
        const res = await request(baseURL)
            .post('/oauth/token')
            .send({ grant_type: 'invalidgrandtype', username: process.env.USERNAME, password: process.env.PASSWORD });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'unprocessable_entity');
    });

    test('POST /oauth/token - happy path returns token structure', async () => {
        const res = await request(baseURL)
            .post('/oauth/token')
            .send({ grant_type: 'password', username: process.env.USERNAME, password: process.env.PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('token_type', 'Bearer');
        expect(typeof res.body.expires_in).toBe('number');
        expect(res.body).toHaveProperty('refresh_token');
        expect(['primary', 'secondary']).toContain(res.body.scope);
    });

    test('POST /oauth/logout - unauthorized without token', async () => {
        const res = await request(baseURL)
            .post('/oauth/logout');
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error', 'unauthorized');
    });

    //this must be called last, as it invalidates the primary token used in other tests
    test('POST /oauth/logout - happy path', async () => {
        const res = await request(baseURL)
            .post('/oauth/logout')
            .set('Authorization', `Bearer ${primaryToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'User logged out');
    });
});
