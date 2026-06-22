// Using built-in fetch in Node
const url = 'http://localhost:3000/v1/auth/login';
const body = { email: 'admin@msomi.co', password: 'password123' };
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
  .then(res => res.json())
  .then(data => {
    console.log('Response:', JSON.stringify(data));
    if (data.accessToken) console.log('TOKEN:', data.accessToken);
  })
  .catch(err => console.error('Error:', err));
