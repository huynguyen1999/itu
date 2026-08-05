export class DomainException extends Error {
  constructor(
    message: string,
    readonly code = 'DOMAIN_ERROR',
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`, 'ENTITY_NOT_FOUND', 404);
  }
}

export class ForbiddenResourceException extends DomainException {
  constructor() {
    super('You do not have access to this resource', 'FORBIDDEN_RESOURCE', 403);
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor(message = 'Invalid email or password') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class InvalidReviewException extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_REVIEW', 422);
  }
}

export class InvalidTrashOperationException extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_TRASH_OPERATION', 422);
  }
}

export class ProtectedDefaultDeckException extends DomainException {
  constructor() {
    super('The default Inbox deck cannot be archived or deleted', 'PROTECTED_DEFAULT_DECK', 422);
  }
}

export class InvalidCardMoveException extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_CARD_MOVE', 422);
  }
}

export class InvalidSyncMutationException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INVALID_SYNC_MUTATION', 400, details);
  }
}

export class InvalidRoleAssignmentException extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_ROLE_ASSIGNMENT', 400);
  }
}

export class InvalidGrowthMappingException extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_GROWTH_MAPPING', 400);
  }
}

export class TermsNotAcceptedException extends DomainException {
  constructor() {
    super('You must agree to the terms and conditions', 'TERMS_NOT_ACCEPTED', 400);
  }
}
