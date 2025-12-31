export interface CommonTranslations {
  errors: {
    validation: {
      failed: string;
      required: string;
      invalid: string;
      internalError: string;
    };
    generic: {
      internalServerError: string;
      badRequest: string;
      notFound: string;
      unauthorized: string;
      forbidden: string;
      conflict: string;
    };
    access: {
      denied: string;
      forbidden: string;
      systemAdminRequired: string;
    };
  };
  messages: {
    success: string;
    created: string;
    updated: string;
    deleted: string;
    fetched: string;
  };
}

export interface AuthTranslations {
  errors: {
    invalidCredentials: string;
    unauthorized: string;
    tokenExpired: string;
    tokenInvalid: string;
    emailAlreadyExists: string;
    userNotFound: string;
    noActiveTenants: string;
    tenantAccessDenied: string;
    verificationTokenInvalid: string;
    resetTokenInvalid: string;
    tokenInvalidType: string;
    noTenantAccess: string;
    tenantOwnershipDenied: string;
  };
  messages: {
    loginSuccess: string;
    logoutSuccess: string;
    signupSuccess: string;
    emailVerified: string;
    passwordResetSent: string;
    passwordResetSuccess: string;
  };
}

export interface TenantTranslations {
  errors: {
    notFound: string;
    notFoundByEmail: string;
    notFoundById: string;
    schemaNotFound: string;
    alreadyExists: string;
    emailAlreadyRegistered: string;
    failedToCreate: string;
    failedToFetch: string;
    failedToUpdate: string;
    failedToDelete: string;
    failedToFetchSchema: string;
    failedToInitialize: string;
    failedToRetrieveDocumentCount: string;
    failedToCheckUploadPermission: string;
    tenantIdRequired: string;
  };
  messages: {
    created: string;
    updated: string;
    deleted: string;
    fetched: string;
  };
}

export interface TemplatesTranslations {
  errors: {
    notFound: string;
    failedToCreate: string;
    failedToFetch: string;
    failedToUpdate: string;
    failedToDelete: string;
    failedToDeactivate: string;
    invalidRulesetKeys: string;
    validationFailed: string;
  };
  messages: {
    created: string;
    updated: string;
    deleted: string;
    deactivated: string;
    fetched: string;
  };
  validation: {
    requiredFieldMissing: string;
    invalidFieldType: string;
    invalidDateFormat: string;
    invalidEmail: string;
    invalidFormat: string;
    invalidLength: string;
    invalidPattern: string;
    invalidEnum: string;
    unknownField: string;
  };
}

export interface StorageTranslations {
  errors: {
    fileNotFound: string;
    failedToUpload: string;
    failedToDownload: string;
    failedToDelete: string;
    fileTooLarge: string;
    invalidFileType: string;
    storageAccessFailed: string;
    fileRetrievalFailed: string;
    downloadUrlFailed: string;
    listFilesFailed: string;
    templateUploadFailed: string;
    templateFileNotFound: string;
    templateDeleteFailed: string;
    templateListFailed: string;
    noFileProvided: string;
    tenantIdRequired: string;
    invalidFileFormat: string;
    fileEmpty: string;
    extensionMismatch: string;
    noFileUploaded: string;
    uploadProcessingFailed: string;
  };
  messages: {
    uploaded: string;
    downloaded: string;
    deleted: string;
  };
}

export interface UsersTranslations {
  errors: {
    notFound: string;
    notFoundInTenant: string;
    alreadyExistsInTenant: string;
    currentPasswordIncorrect: string;
    noFieldsToUpdate: string;
    cannotModifyOwnRole: string;
    cannotRemoveSelf: string;
    failedToCreate: string;
    failedToUpdate: string;
    failedToDelete: string;
    failedToFetch: string;
  };
  messages: {
    passwordChanged: string;
    profileUpdated: string;
    userCreated: string;
    userUpdated: string;
    userRemoved: string;
  };
}

export interface I18nTranslations {
  common: CommonTranslations;
  auth: AuthTranslations;
  tenant: TenantTranslations;
  templates: TemplatesTranslations;
  storage: StorageTranslations;
  users: UsersTranslations;
}
