import { html } from 'hono/html';

// Layout component
export const Layout = (props: { children: any; title: string }) => html`
	<!DOCTYPE html>
	<html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>${props.title}</title>
			<link
				rel="stylesheet"
				href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css"
				integrity="sha512-jnSuA4Ss2PkkikSOLtYs8BlYIeeIK1h99ty4YfvRPAlzr377vr3CXDb7sb7eEEBYjDtcYj+AjBH3FLv5uSJuXg=="
				crossorigin="anonymous"
				referrerpolicy="no-referrer"
			/>
		</head>
		<body>
			<div class="container py-4">${props.children}</div>
		</body>
	</html>
`;

// Application Table component
export const ApplicationTable = (props: {
	apps: Array<{
		hostname: string;
		loginPath: string;
		userCount?: number;
		autoLogin?: boolean;
	}>;
}) => {
	const { apps } = props;

	if (apps.length === 0) {
		return html`<div class="alert alert-info">No applications configured.</div>`;
	}

	return html`
		<div class="table-responsive">
			<table class="table table-striped table-hover">
				<thead>
					<tr>
						<th scope="col">Hostname</th>
						<th scope="col">Login Path</th>
						<th scope="col">Users</th>
						<th scope="col">Auto Login</th>
						<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					${apps.map(
						(app) => html`
							<tr>
								<td>${app.hostname}</td>
								<td>${app.loginPath}</td>
								<td>${app.userCount !== undefined ? app.userCount : '—'}</td>
								<td>${app.autoLogin ? 'Yes' : 'No'}</td>
								<td>
									<a href="/apps/${app.hostname}" class="btn btn-primary btn-sm">Manage</a>
								</td>
							</tr>
						`,
					)}
				</tbody>
			</table>
		</div>
	`;
};

// User Table component
export const UserTable = (props: {
	users: Array<{
		accessEmail: string;
		legacyUsername: string;
	}>;
	hostname: string;
}) => {
	const { users, hostname } = props;

	if (users.length === 0) {
		return html`<div class="alert alert-info">No users configured for this application.</div>`;
	}

	return html`
		<div class="table-responsive">
			<table class="table table-striped table-hover">
				<thead>
					<tr>
						<th scope="col">Access Email Pattern</th>
						<th scope="col">Legacy Username</th>
						<th scope="col">Legacy Password</th>
						<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					${users.map(
						(user) => html`
							<tr>
								<td>${user.accessEmail}</td>
								<td>${user.legacyUsername}</td>
								<td>********</td>
								<td>
									<form
										action="/apps/${hostname}/users/${encodeURIComponent(user.accessEmail)}/delete"
										method="POST"
										style="display: inline;"
									>
										<button type="submit" class="btn btn-danger btn-sm">Delete</button>
									</form>
								</td>
							</tr>
						`,
					)}
				</tbody>
			</table>
		</div>
	`;
};

// Application Form component
export const ApplicationForm = (props: {
	app?: {
		hostname?: string;
		loginPath?: string;
		usernameField?: string;
		passwordField?: string;
		sessionCookie?: string;
		autoLogin?: boolean;
	};
	action: string;
	submitLabel: string;
	showHostname?: boolean;
}) => {
	const { app = {}, action, submitLabel, showHostname = true } = props;
	const { hostname = '', loginPath = '', usernameField = '', passwordField = '', sessionCookie = '', autoLogin = true } = app;

	return html`
		<form action="${action}" method="POST" class="p-4 bg-light rounded shadow-sm">
			<div class="row g-3">
				${showHostname
					? html`
							<div class="col-md-6">
								<label for="hostname" class="form-label">Hostname</label>
								<input type="text" class="form-control" id="hostname" name="hostname" value="${hostname}" required />
							</div>
						`
					: ''}
				<div class="col-md-6">
					<label for="loginPath" class="form-label">Login Path</label>
					<input type="text" class="form-control" id="loginPath" name="loginPath" value="${loginPath}" required />
				</div>
				<div class="col-md-6">
					<label for="usernameField" class="form-label">Username Field</label>
					<input type="text" class="form-control" id="usernameField" name="usernameField" value="${usernameField}" required />
				</div>
				<div class="col-md-6">
					<label for="passwordField" class="form-label">Password Field</label>
					<input type="text" class="form-control" id="passwordField" name="passwordField" value="${passwordField}" required />
				</div>
				<div class="col-md-6">
					<label for="sessionCookie" class="form-label">Session Cookie</label>
					<input type="text" class="form-control" id="sessionCookie" name="sessionCookie" value="${sessionCookie}" required />
				</div>
				<div class="col-md-6">
					<div class="form-check mt-4">
						<input type="checkbox" class="form-check-input" id="autoLogin" name="autoLogin" ${autoLogin ? 'checked' : ''} value="true" />
						<label class="form-check-label" for="autoLogin">Enable Auto Login</label>
					</div>
				</div>
			</div>
			<div class="mt-3">
				<button type="submit" class="btn btn-primary">${submitLabel}</button>
			</div>
		</form>
	`;
};

// User Form component
export const UserForm = (props: { hostname: string }) => {
	const { hostname } = props;

	return html`
		<form action="/apps/${hostname}/users/new" method="POST" class="p-4 bg-light rounded shadow-sm mt-4">
			<h2 class="mb-3">Add New User</h2>
			<div class="row g-3">
				<div class="col-md-6">
					<label for="accessEmail" class="form-label">Access Email Pattern</label>
					<input type="text" class="form-control" id="accessEmail" name="accessEmail" required 
						   placeholder="e.g., user@example.com, *@example.com, *" />
					<div class="form-text">
						Use * as wildcard. More specific patterns take precedence (e.g., user@example.com > *@example.com > *)
					</div>
				</div>
				<div class="col-md-6">
					<label for="legacyUsername" class="form-label">Legacy Username</label>
					<input type="text" class="form-control" id="legacyUsername" name="legacyUsername" required />
				</div>
				<div class="col-md-6">
					<label for="legacyPassword" class="form-label">Legacy Password</label>
					<input type="password" class="form-control" id="legacyPassword" name="legacyPassword" required />
				</div>
			</div>
			<div class="mt-3">
				<button type="submit" class="btn btn-primary">Add User</button>
			</div>
		</form>
	`;
};
