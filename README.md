# haupcar-management API

The REST API behind haupcar-management, the company's car management system. It stores cars, their photos and the people who use the system, and checks every request against the caller's role.

Built for the Haupcar Full-Stack Developer take-home test. The web app that uses this API is in [haupcar-car-management-test-front-end](https://github.com/Totoland1101/haupcar-car-management-test-front-end).

## Features

### Cars

- Add, list, view, edit and delete cars. A car has a registration number, province, brand, model, fuel type, year, color, current mileage, registration date, mileage at registration, status and notes.
- Up to four photos per car (front, left side, right side and back), stored in PostgreSQL
- Search across plate, province, brand, model, color and notes. Filter by brand and status, sort by most fields, and page through the results.
- A summary endpoint with the number of cars in each status and every brand in use
- Duplicate plates are rejected. A plate must be unique within its province, the same as real Thai plates. A red plate (ป้ายแดง, the temporary plate on a new car) is a separate plate, so a red plate and a regular plate can share a number.
- Only Thai plates and Thai provinces are accepted: car plates such as `1กข 1234`, and truck and bus plates such as `70-1234`. Spaces are tidied, so `1กข1234`, `1กข  1234` and `1กข 1234` count as the same plate, and so do `70 1234` and `70-1234`.

### Login and roles

- Every endpoint except `/api/health`, `/api/auth/login` and `/api/auth/register` needs a login token.
- Each user has one role, and each role is a set of permissions. Every route checks its own permission.
- Anyone can sign up. The account can't log in until someone with the `user.approve` permission approves it and picks its role. Until then, logging in returns a "waiting for approval" error. A rejected registration can still be approved later.
- Everyone has a profile with first and last name, email, phone, job title and department. People can change their own profile and password. Only a user manager can change someone's role or set a new password for another account.
- Passwords are stored in one column as `scrypt$<salt>$<hash>`, with a random salt for each user.
- `haup_users` holds the login account (username, password, a `status` of pending, approved or rejected, and who reviewed it). `haup_profiles` holds the person, one row per user: name, contact details, job title, `department_id` and `role_id`. Departments are in `haup_departments`, roles in `haup_roles`, permissions in `haup_permissions`, and the links between roles and permissions in `haup_role_permissions`.

### Other

- Validation with Zod. Each error names the field it belongs to, so a form can show it under that field.
- 12 sample cars and one demo login per role, added by a migration in development
- 107 integration tests

## Tech stack

| Part       | Choice                                         |
| ---------- | ---------------------------------------------- |
| Runtime    | Node.js, Express 5                             |
| Database   | PostgreSQL, accessed through the Sequelize ORM (v6) |
| Migrations | sequelize-cli                                  |
| Validation | Zod                                            |
| Login      | JWT (jsonwebtoken), passwords hashed with Node's built-in scrypt |
| Tests      | Node's built-in test runner (`node:test`) and Supertest |

Every table starts with `haup_`. That includes `haup_sequelize_meta`, where sequelize-cli records which migrations have run.

## Getting started

You need Node.js 20.17 or newer (developed on Node 22), npm and PostgreSQL. Docker is the easiest way to get PostgreSQL.

```bash
git clone https://github.com/Totoland1101/haupcar-car-management-test-back-end.git
cd haupcar-car-management-test-back-end
npm install
docker compose up -d   # PostgreSQL 17 with the haupcar and haupcar_test databases
npm run migration-up   # creates the tables, the default roles, 12 sample cars and the demo logins below
npm run dev            # the API on http://localhost:4000
```

`curl http://localhost:4000/api/health` should answer `{"status":"ok"}`. To use the web app, keep the API running and follow the steps in the [front-end repository](https://github.com/Totoland1101/haupcar-car-management-test-front-end#getting-started).

The demo accounts:

| Username | Password     | Role   | Can do                                   |
| -------- | ------------ | ------ | ---------------------------------------- |
| `admin`  | `admin1234`  | Admin  | Everything, including users and roles    |
| `staff`  | `staff1234`  | Staff  | View, add and edit cars                  |
| `viewer` | `viewer1234` | Viewer | View cars                                |

The sample cars and demo accounts come from the migration `db/migrations/20261121000300-insert-sample-cars-and-demo-users.js`. It only inserts them when `NODE_ENV` is `development` (the default), so a production or test database never gets these known passwords. It skips rows that already exist. `npm run migration-down` right after it removes the sample cars and demo accounts again.

To use your own PostgreSQL server instead of Docker, create a database for the app and one for the tests, then set the `DB_*` variables in `.env` (see [Configuration](#configuration)).

`npm install` prints a deprecation warning for `dottie`. It comes from Sequelize 6 and does not affect the app. `package.json` overrides a few versions to keep `npm audit` clean: Sequelize gets `uuid` 11 instead of `uuid` 8, and `js-beautify` (pulled in by sequelize-cli) gets newer `glob` and `editorconfig`. js-beautify only uses those two in its own command-line tool, which sequelize-cli never runs.

`npm run dev` restarts the API when a file changes. `npm start` runs it without watching.

### Scripts

| Command                    | What it does                                             |
| -------------------------- | -------------------------------------------------------- |
| `npm run dev`              | Start the API and restart it when a file changes         |
| `npm start`                | Start the API                                            |
| `npm test`                 | Migrate the test database, then run the tests            |
| `npm run migration-up`     | Apply pending migrations (`sequelize-cli db:migrate`)    |
| `npm run migration-down`   | Undo the last migration (`db:migrate:undo`)              |
| `npm run migration-status` | List applied and pending migrations                      |
| `npm run migration-generate <name>` | Create a new file in `db/migrations`            |

The migration scripts use the database for `NODE_ENV`, which defaults to `development`. Run `NODE_ENV=production npm run migration-up` to migrate production. To undo one migration by name, run `npm run migration-down -- --name <file>`.

New tables must start with `haup_`. A test checks this on every `npm test`.

### Configuration

The defaults match `docker-compose.yml`. To change them, copy `.env.example` to `.env`. `config/config.js` reads these variables, and both the API and sequelize-cli use it.

| Variable        | Default        | Notes                                   |
| --------------- | -------------- | --------------------------------------- |
| `PORT`          | `4000`         | Port the API listens on                 |
| `DB_HOST`       | `localhost`    | PostgreSQL host                         |
| `DB_PORT`       | `5432`         | PostgreSQL port                         |
| `DB_USER`       | `postgres`     |                                         |
| `DB_PASSWORD`   | `postgres`     |                                         |
| `DB_NAME`       | `haupcar`      | Database for the app                    |
| `DB_NAME_TEST`  | `haupcar_test` | Database for `npm test`. The tests empty its tables. |
| `CORS_ORIGIN`   | `*`            | Allowed origin for cross-origin requests. The web app calls the API from the browser, so its origin must be allowed. |
| `DB_LOGGING`    | `false`        | Set to `true` to print every SQL query  |
| `JWT_SECRET`    | a development value | Secret that signs login tokens. **Required** when `NODE_ENV=production`. |
| `JWT_EXPIRES_IN` | `8h`          | How long a login lasts, e.g. `30m`, `8h`, `7d` |

### Browse the database in DataGrip

In DataGrip choose **File → New → Data Source → PostgreSQL** and paste this URL into the URL field:

```
jdbc:postgresql://localhost:5432/haupcar?user=postgres&password=postgres
```

These are the defaults from `docker-compose.yml`. To see the test database as well, tick `haupcar_test` on the **Schemas** tab.

Any other PostgreSQL client works with the same settings. The tests use the `haupcar_test` database on the same server.

## REST API

All endpoints are under `/api` and use JSON. Apart from `/api/health`, `/api/auth/login` and `/api/auth/register`, every request needs the token from the login response in an `Authorization: Bearer <token>` header, and the user's role must have the permission listed.

| Method   | Path                | Description                                   | Permission | Success |
| -------- | ------------------- | --------------------------------------------- | ---------- | ------- |
| `GET`    | `/api/health`       | Health check                                  | none       | 200     |
| `POST`   | `/api/auth/register` | Sign up with `username`, `password` and `profile` (`firstName`, `lastName`, `email`, `phone`). The account is pending until approved, so no token is returned. | none | 201 |
| `POST`   | `/api/auth/login`   | Log in with `username` and `password`. Returns `{ token, user }`. A pending or rejected account gets a 403. | none | 200 |
| `GET`    | `/api/auth/me`      | The logged-in user, with their profile, role and permission codes | any user | 200 |
| `PUT`    | `/api/auth/me/password` | Change your own password: `currentPassword`, `newPassword` | any user | 204 |
| `PUT`    | `/api/auth/me/profile` | Edit your own profile: `firstName`, `lastName`, `email`, `phone`, `jobTitle`, `departmentId`. The role can't be changed here. | any user | 200 |
| `GET`    | `/api/cars`         | List cars (search, filter, sort, paging)      | `car.view` | 200     |
| `GET`    | `/api/cars/summary` | Number of cars per status, and brands in use  | `car.view` | 200     |
| `GET`    | `/api/cars/:id`     | Get one car                                   | `car.view` | 200     |
| `POST`   | `/api/cars`         | Add a car                                     | `car.create` | 201   |
| `PUT`    | `/api/cars/:id`     | Replace a car's details                       | `car.update` | 200   |
| `DELETE` | `/api/cars/:id`     | Delete a car and its photos                   | `car.delete` | 204   |
| `GET`    | `/api/cars/:id/photos` | Which sides have a photo                   | `car.view` | 200     |
| `GET`    | `/api/cars/:id/photos/:side` | The photo itself. `side` is `front`, `left`, `right` or `back`. | `car.view` | 200 |
| `PUT`    | `/api/cars/:id/photos/:side` | Add or replace a photo. The body is the image, sent as `image/jpeg`, `image/png` or `image/webp`, up to 5 MB. | `car.update` | 201 or 200 |
| `DELETE` | `/api/cars/:id/photos/:side` | Remove a photo                         | `car.update` | 204   |
| `GET`    | `/api/users`        | List approved users with their role           | `user.manage` | 200  |
| `GET`    | `/api/users/:id`    | Get one user                                  | `user.manage` | 200  |
| `POST`   | `/api/users`        | Add a user: `username`, `password`, `roleId`, `isActive` and `profile` (same fields as `/api/auth/me/profile`) | `user.manage` | 201 |
| `PUT`    | `/api/users/:id`    | Replace a user's details. Leave `password` out or null to keep it. | `user.manage` | 200 |
| `PUT`    | `/api/users/:id/password` | Set a new password for an account: `password` | `user.manage` | 204 |
| `DELETE` | `/api/users/:id`    | Delete a user                                 | `user.manage` | 204  |
| `GET`    | `/api/roles`        | List roles with permission codes and user counts | `role.manage`, `user.manage` or `user.approve` | 200 |
| `GET`    | `/api/roles/:id`    | Get one role                                  | `role.manage` | 200  |
| `POST`   | `/api/roles`        | Add a role: `name`, `description`, `permissions` (codes) | `role.manage` | 201 |
| `PUT`    | `/api/roles/:id`    | Replace a role's details and permissions      | `role.manage` | 200  |
| `DELETE` | `/api/roles/:id`    | Delete a role nobody has                      | `role.manage` | 204  |
| `GET`    | `/api/permissions`  | Every permission, for the role form           | `role.manage` | 200  |
| `GET`    | `/api/registrations?status=pending` | Registrations that are `pending` (default) or `rejected`, plus `counts` of both | `user.approve` | 200 |
| `POST`   | `/api/registrations/:id/approve` | Approve with a `roleId`. Also works on a rejected registration. | `user.approve` | 200 |
| `POST`   | `/api/registrations/:id/reject` | Reject a pending registration          | `user.approve` | 200 |
| `GET`    | `/api/departments`  | Departments with how many people are in each  | any user | 200 |
| `POST`   | `/api/departments`  | Add a department: `name`                      | `user.manage` | 201 |
| `PUT`    | `/api/departments/:id` | Rename a department                        | `user.manage` | 200 |
| `DELETE` | `/api/departments/:id` | Delete a department. Its people keep their accounts. | `user.manage` | 204 |

### Permissions and default roles

The permissions and the three default roles are created by `npm run migration-up`. A user who registers has no role until it is approved.

| Code          | Meaning                       | Admin | Staff | Viewer |
| ------------- | ----------------------------- | :---: | :---: | :----: |
| `car.view`    | View cars                     | ✓     | ✓     | ✓      |
| `car.create`  | Add cars                      | ✓     | ✓     |        |
| `car.update`  | Edit cars                     | ✓     | ✓     |        |
| `car.delete`  | Delete cars                   | ✓     |       |        |
| `user.manage` | Manage users                  | ✓     |       |        |
| `user.approve` | Approve registrations        | ✓     |       |        |
| `role.manage` | Manage roles and permissions  | ✓     |       |        |

Admin is a system role. It always has every permission and can't be edited or deleted. Staff and Viewer can be changed like any role you add. A role can't be deleted while users still have it, and you can't disable, delete or change the role of your own account, so an admin can't lock themselves out by accident.

### Query parameters for `GET /api/cars`

| Parameter  | Default     | Values                                                                                   |
| ---------- | ----------- | ---------------------------------------------------------------------------------------- |
| `search`   |             | Text to look for in plate, province, brand, model, color and notes                       |
| `status`   |             | `available`, `in_use`, `maintenance`, `inactive`                                         |
| `brand`    |             | Exact brand, case-insensitive                                                            |
| `sortBy`   | `updatedAt` | `registrationNumber`, `brand`, `model`, `year`, `mileage`, `registeredOn`, `createdAt`, `updatedAt` |
| `order`    | `desc`      | `asc`, `desc`                                                                            |
| `page`     | `1`         | 1 or more                                                                                |
| `pageSize` | `10`        | 1 to 100                                                                                 |

The response looks like this:

```json
{
  "data": [{ "id": 1, "registrationNumber": "1กข 1234", "...": "..." }],
  "meta": { "page": 1, "pageSize": 10, "total": 12 }
}
```

### Car fields

| Field                | Type              | Rules                                                              |
| -------------------- | ----------------- | ------------------------------------------------------------------ |
| `registrationNumber` | string            | Required. A Thai plate in one of two forms. Cars, pickups and taxis: an optional leading digit, one or two Thai consonants, then 1 to 9999, e.g. `1กข 1234` or `กข 1234`. Trucks and buses: a two-digit type from 10 to 99, a dash, then up to four digits, e.g. `70-1234`. Spaces are tidied, so `1กข1234` is stored as `1กข 1234` and `70 1234` as `70-1234`. |
| `redPlate`           | boolean           | Optional, defaults to `false`. `true` for a red plate (ป้ายแดง). |
| `province`           | string            | Required. One of the 77 Thai provinces, written in Thai                |
| `brand`              | string            | Required, up to 50 characters                                      |
| `model`              | string            | Required, up to 50 characters                                      |
| `fuelType`           | string            | Required. `gasoline`, `diesel`, `hybrid`, `plug_in_hybrid`, `electric`, `lpg` or `ngv`. Cars added before this field existed have null until someone edits them. |
| `year`               | integer or null   | 1900 up to next year                                               |
| `color`              | string or null    | Up to 30 characters                                                |
| `mileage`            | integer or null   | Current reading in kilometres, 0 or more. Can't be lower than `registeredMileage`. |
| `registeredOn`       | date or null      | `YYYY-MM-DD`, the day the car was registered in the system. Not in the future. Left out, a new car gets today and an edit keeps the old date. |
| `registeredMileage`  | integer           | Required. Kilometres on the registration date, 0 or more. Cars added before this field existed have null until someone edits them. |
| `status`             | string            | `available` (default), `in_use`, `maintenance` or `inactive`       |
| `notes`              | string or null    | Up to 1,000 characters                                             |
| `id`, `createdAt`, `updatedAt` | read-only | Set by the server                                             |

### Example

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin1234"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -X POST http://localhost:4000/api/cars \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"registrationNumber":"1กข 1234","province":"กรุงเทพมหานคร","brand":"Toyota","model":"Yaris Ativ","fuelType":"gasoline","registeredMileage":0}'
```

### Errors

Every error has the same shape:

```json
{
  "error": {
    "message": "Validation failed",
    "details": [{ "field": "brand", "message": "Brand is required" }]
  }
}
```

| Status | When                                                       |
| ------ | ---------------------------------------------------------- |
| 400    | Invalid body, query parameter or id, or malformed JSON     |
| 401    | Not logged in, the token expired or is invalid, the account was disabled, or a wrong username or password at login |
| 403    | The user's role doesn't have the permission, or login to an account that is disabled, waiting for approval or rejected |
| 404    | The record or route does not exist                         |
| 409    | A duplicate plate, username or role name, or a change that isn't allowed (editing the Admin role, deleting a role users still have, deleting yourself, approving an approved account) |
| 413    | An upload over the size limit (5 MB for photos)            |
| 415    | A photo sent with a type other than JPEG, PNG or WebP      |
| 500    | Unexpected server error                                    |

## Project structure

```
.
├── .sequelizerc            Tells sequelize-cli where the config, models and migrations are
├── config/config.js        Reads .env: app settings and database settings per NODE_ENV
├── db/
│   ├── migrations/         sequelize-cli migrations
│   └── models/
│       ├── index.js        Connects Sequelize to PostgreSQL and loads every model
│       ├── Car.js          haup_cars
│       ├── CarPhoto.js     haup_car_photos, one image per side of a car
│       ├── User.js         haup_users, the login account. Leaves the password out unless asked.
│       ├── Profile.js      haup_profiles: name, contact details, job title, department and role
│       ├── Department.js   haup_departments
│       ├── Role.js         haup_roles
│       ├── Permission.js   haup_permissions
│       └── RolePermission.js  haup_role_permissions (which role has which permission)
├── src/
│   ├── app.js              Express app: middleware and routes
│   ├── server.js           Starts the HTTP server
│   ├── errors.js           HttpError and the JSON error handler
│   ├── validation.js       Zod validation and id parsing shared by the routes
│   ├── auth/
│   │   ├── password.js     scrypt hashing, stored as scrypt$<salt>$<hash>
│   │   ├── token.js        Signs and checks JWTs
│   │   ├── middleware.js   authenticate (who is calling) and can() (permission checks)
│   │   ├── permissions.js  Permission codes
│   │   └── routes.js       /api/auth/login, /api/auth/register, /api/auth/me and /api/auth/me/profile
│   ├── cars/               schema.js, repository.js, routes.js for /api/cars, photos.js for the photos,
│   │                       and thai.js for the plate format and the 77 provinces
│   ├── users/              schema.js, repository.js, routes.js for /api/users
│   ├── roles/              schema.js, repository.js, routes.js for /api/roles and /api/permissions
│   ├── registrations/      routes.js for /api/registrations (approve and reject sign-ups)
│   └── departments/        repository.js, routes.js for /api/departments
├── test/
│   ├── cars.test.js        Car API tests
│   ├── auth.test.js        Login, passwords, permissions, users and roles
│   ├── registrations.test.js  Sign-up and approval
│   ├── profiles.test.js    Profiles, My profile and departments
│   ├── photos.test.js      Car photos
│   └── helpers.js          Creates users and logs them in for the tests
├── docker/postgres/        Creates the test database the first time the container starts
└── docker-compose.yml      Local PostgreSQL
```

## Design notes

- A request goes through the route handler, then Zod validation, then the repository. Route handlers never touch the database, and the repository knows nothing about HTTP.
- Passwords go through scrypt, which is slow and memory-hard on purpose, with a random 16-byte salt for each user. The salt and the hash are stored together in one column, `scrypt$<salt>$<hash>`, and two users with the same password get different hashes. Password checks use a constant-time comparison. A login with an unknown username still runs scrypt, so response times don't reveal which usernames exist.
- A successful login returns a JWT signed with `JWT_SECRET`. The API loads the user and their role's permissions again on every request, so disabling an account or changing a role takes effect immediately, before the token expires.
- Every route checks its own permission, and the tests call the API directly to confirm it. A web app can hide what a role can't use, but the API is what enforces it.
- The `Car` model maps camelCase attributes to snake_case columns with `field` and manages `created_at` and `updated_at`.
- Migrations own the schema. The API never calls `sequelize.sync()`, so every change to a table goes through a migration file that can be reviewed and undone. Each migration runs inside a transaction.
- Photos are stored in PostgreSQL (`haup_car_photos`, a `bytea` column), so there is no file storage to set up. The API checks each file's first bytes as well as its declared type, so a renamed text file is rejected.
- Thai plates repeat across provinces, and a red plate can carry the same number as a regular one, so the unique index is on `(registration_number, province, is_red_plate)`.
- PUT replaces the whole record, so the API has no PATCH.
- Deleting a car is permanent. To keep a car on record while it is out of use, set its status to `inactive`.
- `sortBy` must be one of a fixed list and is mapped to a column name, so it can't be used to inject SQL. Search text goes through `sequelize.escape()`, and `%` and `_` are escaped too so they match literally. Search uses `ILIKE`, so it ignores letter case. This is the only condition written by hand, because Sequelize has no option for `ILIKE ... ESCAPE`.

## Tests

```bash
npm test
```

PostgreSQL must be running (`docker compose up -d`). `npm test` runs the migrations on the test database (`DB_NAME_TEST`), then runs 107 integration tests.

- `test/cars.test.js` (38 tests) covers create, read, update and delete, Thai plate and province rules (car, truck and bus plates), red plates, the fuel type, the registration date and mileage, validation errors, duplicate plates, search, filters, sorting, paging, the error format, and the `haup_` table prefix. It runs as an admin.
- `test/auth.test.js` (30 tests) covers login, how passwords are stored, invalid and expired tokens, disabled accounts, what each default role may do, and the users, roles and permissions endpoints.
- `test/registrations.test.js` (16 tests) covers signing up, logging in while pending or rejected, approving with a role, rejecting, and who is allowed to do it.
- `test/photos.test.js` (8 tests) covers uploading, replacing, listing and deleting photos, the type and size checks, who may change them, and that deleting a car deletes its photos.
- `test/profiles.test.js` (15 tests) covers the split between `haup_users` and `haup_profiles`, creating a user with a full profile, editing your own profile without touching the role, changing and resetting passwords, and the departments endpoints.

The tests empty the car and user tables before each test and remove any roles they added.
