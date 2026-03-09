# Frontend Integration Guides

This folder contains integration guides for frontend developers working with the Complytude API.

## Available Guides

- **[DUNNING_UI_INTEGRATION.md](./DUNNING_UI_INTEGRATION.md)** - How to integrate payment failure banners and dunning notifications in the UI

## Future Integration Guides

As the system grows, this folder will contain guides for:

- **Entitlement UI Integration** - How to check feature access and display usage limits
- **Subscription Management UI** - How to implement billing settings and plan changes
- **Document Generation UI** - How to integrate document creation workflows
- **Audit Trail UI** - How to display user activity and system events
- **Notification Center UI** - How to implement in-app notifications
- **Multi-language UI** - How to integrate with the i18n system

## Structure

Each integration guide should include:

1. **API Endpoints** - Which endpoints to call
2. **Response Structures** - TypeScript interfaces for responses
3. **UI Implementation** - Concrete examples with code snippets
4. **Error Handling** - How to handle API errors gracefully
5. **Testing** - Mock data and test scenarios
6. **Security Notes** - Authentication and data handling considerations

## Related Documentation

- **[API Contracts](../../../apps/api/docs/API_CONTRACTS.md)** - Complete API specification
- **[Architecture](../ARCHITECTURE.md)** - System design and component overview
- **[RBAC](../RBAC.md)** - Role-based access control system
- **[Entitlements](../ENTITLEMENTS.md)** - Feature access and usage tracking