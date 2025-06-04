import { describe, it, expect } from 'vitest';
import { matchesEmailPattern, getPatternSpecificity } from '../src/index';

interface CredentialPattern {
	accessEmail: string;
	legacyUsername: string;
	legacyPassword: string;
}

function findBestMatch(credentials: CredentialPattern[], userEmail: string): CredentialPattern | null {
	const matchingCredentials = credentials
		.filter(cred => matchesEmailPattern(cred.accessEmail, userEmail))
		.sort((a, b) => getPatternSpecificity(b.accessEmail) - getPatternSpecificity(a.accessEmail));
	
	return matchingCredentials.length > 0 ? matchingCredentials[0] : null;
}

describe('Wildcard Email Matching', () => {
	const credentials: CredentialPattern[] = [
		{ accessEmail: 'michiel@example.com', legacyUsername: 'admin', legacyPassword: 'Admin123' },
		{ accessEmail: '*@example.com', legacyUsername: 'user', legacyPassword: 'p4ssw0rd' },
		{ accessEmail: '*', legacyUsername: 'guest', legacyPassword: 'guest' },
	];

	describe('matchesEmailPattern', () => {
		it('should match exact email addresses', () => {
			expect(matchesEmailPattern('user@example.com', 'user@example.com')).toBe(true);
			expect(matchesEmailPattern('user@example.com', 'other@example.com')).toBe(false);
		});

		it('should match wildcard patterns', () => {
			expect(matchesEmailPattern('*@example.com', 'user@example.com')).toBe(true);
			expect(matchesEmailPattern('*@example.com', 'admin@example.com')).toBe(true);
			expect(matchesEmailPattern('*@example.com', 'user@other.com')).toBe(false);
		});

		it('should match universal wildcard', () => {
			expect(matchesEmailPattern('*', 'anyone@anywhere.com')).toBe(true);
			expect(matchesEmailPattern('*', 'test@test.com')).toBe(true);
		});

		it('should handle complex patterns', () => {
			expect(matchesEmailPattern('test*@example.com', 'test123@example.com')).toBe(true);
			expect(matchesEmailPattern('test*@example.com', 'testing@example.com')).toBe(true);
			expect(matchesEmailPattern('test*@example.com', 'user@example.com')).toBe(false);
		});

		it('should be case insensitive', () => {
			expect(matchesEmailPattern('USER@EXAMPLE.COM', 'user@example.com')).toBe(true);
			expect(matchesEmailPattern('*@EXAMPLE.COM', 'user@example.com')).toBe(true);
		});
	});

	describe('getPatternSpecificity', () => {
		it('should rank exact matches highest', () => {
			expect(getPatternSpecificity('user@example.com')).toBeGreaterThan(getPatternSpecificity('*@example.com'));
		});

		it('should rank domain wildcards higher than universal wildcard', () => {
			expect(getPatternSpecificity('*@example.com')).toBeGreaterThan(getPatternSpecificity('*'));
		});

		it('should handle multiple wildcards', () => {
			expect(getPatternSpecificity('test@example.com')).toBeGreaterThan(getPatternSpecificity('*@*.com'));
		});

		it('should give universal wildcard lowest score', () => {
			expect(getPatternSpecificity('*')).toBe(0);
		});
	});

	describe('findBestMatch', () => {
		it('should prioritize exact email matches', () => {
			const result = findBestMatch(credentials, 'michiel@example.com');
			expect(result?.legacyUsername).toBe('admin');
		});

		it('should fall back to domain wildcard for other users in domain', () => {
			const result = findBestMatch(credentials, 'employee@example.com');
			expect(result?.legacyUsername).toBe('user');
		});

		it('should fall back to universal wildcard for any other email', () => {
			const result = findBestMatch(credentials, 'anyone@other.com');
			expect(result?.legacyUsername).toBe('guest');
		});

		it('should return null when no patterns match', () => {
			const limitedCredentials = [
				{ accessEmail: 'specific@example.com', legacyUsername: 'admin', legacyPassword: 'pass' }
			];
			const result = findBestMatch(limitedCredentials, 'other@example.com');
			expect(result).toBeNull();
		});

		it('should handle multiple domain patterns correctly', () => {
			const multiDomainCredentials = [
				{ accessEmail: '*@company.com', legacyUsername: 'company_user', legacyPassword: 'pass1' },
				{ accessEmail: '*@example.com', legacyUsername: 'example_user', legacyPassword: 'pass2' },
				{ accessEmail: '*', legacyUsername: 'guest', legacyPassword: 'guest' },
			];

			expect(findBestMatch(multiDomainCredentials, 'user@company.com')?.legacyUsername).toBe('company_user');
			expect(findBestMatch(multiDomainCredentials, 'user@example.com')?.legacyUsername).toBe('example_user');
			expect(findBestMatch(multiDomainCredentials, 'user@other.com')?.legacyUsername).toBe('guest');
		});
	});

	describe('Edge cases', () => {
		it('should handle empty credential list', () => {
			const result = findBestMatch([], 'user@example.com');
			expect(result).toBeNull();
		});

		it('should handle malformed email addresses gracefully', () => {
			expect(matchesEmailPattern('*@example.com', 'notanemail')).toBe(false);
			expect(matchesEmailPattern('*', 'notanemail')).toBe(true);
		});

		it('should escape special regex characters in patterns', () => {
			expect(matchesEmailPattern('user+test@example.com', 'user+test@example.com')).toBe(true);
			expect(matchesEmailPattern('user.test@example.com', 'user.test@example.com')).toBe(true);
		});
	});
});