# Dunning UI Integration Guide

This document explains how the frontend should integrate with the dunning automation system to display payment failure banners.

## API Endpoint

Use the existing billing status endpoint:

```
GET /api/billing/status
```

**Authentication:** Requires tenant token (`tenantAccessToken` cookie)

## Response Structure

```typescript
interface BillingStatusResponse {
  subscription: {
    id: string;
    status: 'active' | 'past_due' | 'canceled' | 'unpaid';
    // ... other subscription fields
  };
  cancel_at_period_end: boolean;
  pending_plan_change?: {
    new_plan_key: string;
    scheduled_for: string;
  };
  dunning?: {
    last_payment_failure?: {
      invoice_id: string;
      amount: number;
      attempt_count: number;
      next_attempt: Date | null;
      failed_at: Date;
    };
    payment_action_required?: {
      invoice_url: string;
      amount: number;
    };
  };
}
```

## UI Implementation

### 1. Check for Past Due Status

```typescript
const response = await fetch('/api/billing/status');
const billingStatus = await response.json();

const shouldShowDunningBanner = billingStatus.subscription.status === 'past_due';
```

### 2. Display Banner Content

When `shouldShowDunningBanner` is true, display a banner with:

#### Payment Failed Banner
```typescript
if (billingStatus.dunning?.last_payment_failure) {
  const failure = billingStatus.dunning.last_payment_failure;
  
  // Show banner with:
  // - "Payment Failed" message
  // - Amount due: formatCurrency(failure.amount, 'AED')
  // - Attempt count: failure.attempt_count
  // - Next retry: failure.next_attempt (if exists)
  // - CTA: "Update Payment Method" -> payment_action_required.invoice_url
}
```

#### Payment Action Required Banner
```typescript
if (billingStatus.dunning?.payment_action_required) {
  const action = billingStatus.dunning.payment_action_required;
  
  // Show banner with:
  // - "Action Required" message
  // - Amount due: formatCurrency(action.amount, 'AED')
  // - CTA: "Complete Payment" -> action.invoice_url
}
```

### 3. Banner Styling

**Recommended styling:**
- **Background:** Warning yellow/orange for payment failures
- **Background:** Red for final notices (attempt_count >= 3)
- **Position:** Top of dashboard, persistent until resolved
- **Dismissible:** No - critical payment issues should not be dismissible
- **CTA Button:** Prominent, contrasting color

### 4. Refresh Strategy

**Polling frequency:**
- Check billing status every 5-10 minutes when banner is visible
- Check on page load/navigation
- Check after user returns from payment flow

### 5. Example Banner Messages

#### English
```
⚠️ Payment Failed
Your payment of AED 99.00 was declined. Please update your payment method to avoid service interruption.
[Update Payment Method]
```

#### Arabic (RTL)
```
⚠️ فشل الدفع
تم رفض دفعتك بقيمة 99.00 درهم. يرجى تحديث طريقة الدفع لتجنب انقطاع الخدمة.
[تحديث طريقة الدفع]
```

## Currency Formatting

```typescript
function formatCurrency(amountInFils: number): string {
  const amountInAED = amountInFils / 100;
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
  }).format(amountInAED);
}
```

## Testing

### Test Scenarios

1. **Active Subscription:** No banner should appear
2. **Past Due with Payment Failure:** Banner with failure details
3. **Past Due with Action Required:** Banner with payment link
4. **Multiple Failed Attempts:** Escalated warning styling
5. **After Successful Payment:** Banner should disappear on next status check

### Mock Data

```typescript
// Past due with payment failure
const mockPastDue = {
  subscription: { status: 'past_due' },
  dunning: {
    last_payment_failure: {
      invoice_id: 'in_test123',
      amount: 9900, // AED 99.00
      attempt_count: 2,
      next_attempt: '2026-03-12T00:00:00Z',
      failed_at: '2026-03-09T12:00:00Z',
    },
    payment_action_required: {
      invoice_url: 'https://invoice.stripe.com/i/test',
      amount: 9900,
    },
  },
};
```

## Error Handling

```typescript
try {
  const response = await fetch('/api/billing/status');
  if (!response.ok) {
    // Handle API errors gracefully
    // Don't show banner if we can't determine status
    return;
  }
  const billingStatus = await response.json();
  // ... handle banner display
} catch (error) {
  // Log error but don't crash the UI
  console.error('Failed to fetch billing status:', error);
}
```

## Security Notes

- The `/billing/status` endpoint is tenant-scoped and requires authentication
- Payment URLs are Stripe-hosted and secure
- No sensitive payment information is exposed in the API response
- All amounts are in the smallest currency unit (fils for AED) to avoid precision issues