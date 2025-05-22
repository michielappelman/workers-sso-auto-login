CREATE TABLE `app_config` (
	`hostname` text PRIMARY KEY NOT NULL,
	`login_path` text NOT NULL,
	`username_field` text NOT NULL,
	`password_field` text NOT NULL,
	`session_cookie` text NOT NULL,
	`auto_login` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`access_email` text NOT NULL,
	`app_hostname` text NOT NULL,
	`legacy_username` text NOT NULL,
	`legacy_password` text NOT NULL,
	FOREIGN KEY (`app_hostname`) REFERENCES `app_config`(`hostname`) ON UPDATE no action ON DELETE no action
);
