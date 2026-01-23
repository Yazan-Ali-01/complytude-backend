"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREDIT_PRICES = exports.PLAN_METADATA = exports.USAGE_TRACKED_FEATURES = exports.PLAN_FEATURES = void 0;
exports.getDefaultPlanFeatures = getDefaultPlanFeatures;
exports.isValidPlan = isValidPlan;
exports.isUsageTrackedFeature = isUsageTrackedFeature;
exports.getDocumentCreditsRequired = getDocumentCreditsRequired;
exports.getCreditPrice = getCreditPrice;
exports.PLAN_FEATURES = {
    navigator: {
        documents_per_month: 5,
        template_library: 'basic',
        bilingual_quality: 'none',
        contract_reviews_per_month: 3,
        risk_analysis_level: 'basic',
        redlining_enabled: false,
        localizer_check: false,
        regulatory_hub_access: false,
        regulatory_queries_per_month: 0,
        license_verifier_lookups: 0,
        jurisdictions: ['UAE'],
        selected_jurisdiction: 'UAE',
        user_seats: 1,
        data_isolation: 'shared',
        custom_playbooks: false,
        white_label_exports: false,
    },
    shield: {
        documents_per_month: 25,
        template_library: 'basic',
        bilingual_quality: 'standard',
        contract_reviews_per_month: 15,
        risk_analysis_level: 'advanced',
        redlining_enabled: true,
        localizer_check: true,
        regulatory_hub_access: true,
        regulatory_queries_per_month: 20,
        license_verifier_lookups: 10,
        jurisdictions: ['UAE', 'DIFC', 'ADGM'],
        selected_jurisdiction: 'UAE',
        user_seats: 3,
        data_isolation: 'shared',
        custom_playbooks: false,
        white_label_exports: false,
    },
    general_counsel: {
        documents_per_month: 100,
        template_library: 'full',
        bilingual_quality: 'premium',
        contract_reviews_per_month: 50,
        risk_analysis_level: 'comprehensive',
        redlining_enabled: true,
        localizer_check: true,
        regulatory_hub_access: true,
        regulatory_queries_per_month: 100,
        license_verifier_lookups: 50,
        jurisdictions: ['UAE', 'DIFC', 'ADGM', 'DMCC', 'RAKEZ', 'IFZA'],
        selected_jurisdiction: 'UAE',
        user_seats: 10,
        data_isolation: 'shared',
        custom_playbooks: true,
        white_label_exports: true,
    },
    infrastructure: {
        documents_per_month: -1,
        template_library: 'full',
        bilingual_quality: 'premium',
        contract_reviews_per_month: -1,
        risk_analysis_level: 'comprehensive',
        redlining_enabled: true,
        localizer_check: true,
        regulatory_hub_access: true,
        regulatory_queries_per_month: -1,
        license_verifier_lookups: -1,
        jurisdictions: ['UAE', 'DIFC', 'ADGM', 'DMCC', 'RAKEZ', 'IFZA', 'JAFZA', 'DAFZA'],
        selected_jurisdiction: 'UAE',
        user_seats: -1,
        data_isolation: 'dedicated',
        custom_playbooks: true,
        white_label_exports: true,
    },
};
exports.USAGE_TRACKED_FEATURES = [
    'documents_per_month',
    'contract_reviews_per_month',
    'regulatory_queries_per_month',
    'license_verifier_lookups',
];
exports.PLAN_METADATA = {
    navigator: { name: 'Navigator', price_aed: 0, description: 'Free tier for founders' },
    shield: { name: 'Shield', price_aed: 249, description: 'Solo entrepreneurs (1-5 employees)' },
    general_counsel: { name: 'General Counsel', price_aed: 599, description: 'Active SMEs (5-50 employees)' },
    infrastructure: { name: 'Infrastructure', price_aed: 2499, description: 'Agencies & enterprise' },
};
function getDefaultPlanFeatures(plan) {
    return { ...exports.PLAN_FEATURES[plan] };
}
function isValidPlan(plan) {
    return plan in exports.PLAN_FEATURES;
}
function isUsageTrackedFeature(feature) {
    return exports.USAGE_TRACKED_FEATURES.includes(feature);
}
exports.CREDIT_PRICES = {
    documents_per_month: 125,
    contract_reviews_per_month: 99,
    regulatory_queries_per_month: 49,
    license_verifier_lookups: 29,
};
function getDocumentCreditsRequired(pageCount) {
    if (pageCount >= 40)
        return 3;
    if (pageCount >= 15)
        return 2;
    return 1;
}
function getCreditPrice(featureKey) {
    return exports.CREDIT_PRICES[featureKey] ?? 0;
}
//# sourceMappingURL=plan-features.config.js.map