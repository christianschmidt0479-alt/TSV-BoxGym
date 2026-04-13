// Validierungsregeln für members_v2 Felder (Phase 1)
// Pflichtfelder, E-Mail, base_group

import { isTrainingGroup } from '../../trainingGroups';
import { validatePassword } from '../auth/password';

export function validateMemberV2Input(input: any): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	if (!input.email || typeof input.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
		errors.push('INVALID_EMAIL');
	}
	if (!input.password || typeof input.password !== 'string' || !validatePassword(input.password)) {
		errors.push('INVALID_PASSWORD');
	}
	if (!input.first_name || typeof input.first_name !== 'string' || !input.first_name.trim()) {
		errors.push('MISSING_FIRST_NAME');
	}
	if (!input.last_name || typeof input.last_name !== 'string' || !input.last_name.trim()) {
		errors.push('MISSING_LAST_NAME');
	}
	if (!input.base_group || typeof input.base_group !== 'string' || !isTrainingGroup(input.base_group)) {
		errors.push('INVALID_BASE_GROUP');
	}
	return { valid: errors.length === 0, errors };
}
