/**
 * Prompt Templates for Code Execution
 * 
 * These templates instruct the LLM how to generate executable code
 * instead of making individual tool calls. They are generic and work
 * for ANY client's tools - clients just inject their tool list.
 * 
 * SCALABILITY: Same templates work for all clients.
 * Tool-specific context is injected at runtime.
 */

/**
 * Prompt template collection
 */
export const PROMPT_TEMPLATES = {
  /**
   * System prompt addition that enables code execution mode
   */
  SYSTEM_PROMPT_ADDITION: `
## Code Execution Mode

You have access to a code execution environment. Instead of making multiple individual tool calls, you can write JavaScript code that orchestrates multiple operations efficiently.

### When to Use Code Execution:
- When you need to call multiple tools
- When you need to filter, transform, or combine data
- When you need conditional logic (if/else)
- When you need loops or iterations

### Code Execution Format:
When you want to execute code, respond with a code block:

\`\`\`javascript
// Your code here
const result = await toolName({ param: value });
return result;
\`\`\`

### Available Tools:
{{TOOL_DESCRIPTIONS}}

### Rules:
1. Always use \`await\` when calling tools (they are async)
2. Always \`return\` your final result
3. You can use: JSON, Math, Date, Array methods, Object methods
4. You CANNOT use: setTimeout, setInterval, fetch, require, import
5. Keep code simple and readable
`,

  /**
   * Template for complex multi-step operations
   */
  MULTI_STEP_TEMPLATE: `
### Multi-Step Task

For this task, write code that:
1. Gathers all necessary data
2. Processes and filters as needed
3. Returns a structured response

Example pattern:
\`\`\`javascript
// Step 1: Gather data
const products = await searchProducts({ query: userQuery });

// Step 2: Enrich with additional data
const enriched = await Promise.all(
  products.slice(0, 5).map(async (p) => ({
    ...p,
    inventory: await getInventory({ productId: p.id }),
    reviews: await getReviews({ productId: p.id, limit: 3 }),
  }))
);

// Step 3: Filter and format
const available = enriched
  .filter(p => p.inventory.quantity > 0)
  .map(p => ({
    name: p.name,
    price: p.price,
    rating: p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length,
  }));

return available;
\`\`\`
`,

  /**
   * Template for data aggregation tasks
   */
  AGGREGATION_TEMPLATE: `
### Data Aggregation

When you need to combine data from multiple sources:

\`\`\`javascript
// Parallel data fetching
const [products, categories, inventory] = await Promise.all([
  searchProducts({ query }),
  getCategories({}),
  getInventoryBatch({ productIds }),
]);

// Combine and aggregate
const result = products.map(p => ({
  ...p,
  categoryName: categories.find(c => c.id === p.categoryId)?.name,
  inStock: inventory[p.id]?.quantity > 0,
}));

return {
  items: result,
  total: result.length,
  inStockCount: result.filter(r => r.inStock).length,
};
\`\`\`
`,

  /**
   * Template for conditional operations
   */
  CONDITIONAL_TEMPLATE: `
### Conditional Operations

When logic depends on previous results:

\`\`\`javascript
const user = await getUser({ userId });

// Different paths based on user type
if (user.isPremium) {
  const premiumDeals = await getPremiumDeals({ userId: user.id });
  return { deals: premiumDeals, message: "Exclusive premium deals!" };
} else {
  const regularDeals = await getPublicDeals({ limit: 10 });
  return { deals: regularDeals, message: "Check out our deals!" };
}
\`\`\`
`,

  /**
   * Error handling template
   */
  ERROR_HANDLING_TEMPLATE: `
### Error Handling

Handle potential failures gracefully:

\`\`\`javascript
try {
  const product = await getProduct({ productId });
  
  if (!product) {
    return { error: "Product not found", productId };
  }
  
  const [inventory, reviews] = await Promise.all([
    getInventory({ productId }).catch(() => ({ quantity: 0 })),
    getReviews({ productId }).catch(() => []),
  ]);
  
  return {
    ...product,
    inventory,
    reviews,
  };
} catch (error) {
  return { error: "Failed to fetch product details" };
}
\`\`\`
`,

  /**
   * Template for booking/reservation workflows
   */
  BOOKING_WORKFLOW_TEMPLATE: `
### Booking/Reservation Workflow

Complete booking flow: check availability → reserve → confirm:

\`\`\`javascript
// Step 1: Check availability
const availability = await checkAvailability({
  service_id: serviceId,
  date: requestedDate,
  guests: partySize,
});

if (!availability.available) {
  // Suggest alternatives
  const alternatives = await getAlternativeSlots({
    service_id: serviceId,
    preferred_date: requestedDate,
    range_days: 3,
  });
  return {
    success: false,
    message: "Requested slot unavailable",
    alternatives: alternatives.slots,
  };
}

// Step 2: Create reservation
const reservation = await createReservation({
  service_id: serviceId,
  date: requestedDate,
  guests: partySize,
  customer_name: customerName,
  customer_phone: customerPhone,
});

// Step 3: Get confirmation details
return {
  success: true,
  reservation_id: reservation.id,
  confirmation_code: reservation.confirmation_code,
  details: {
    service: availability.service_name,
    date: reservation.date,
    time: reservation.time,
    guests: partySize,
  },
  message: \`Booking confirmed! Your confirmation code is \${reservation.confirmation_code}\`,
};
\`\`\`
`,

  /**
   * Template for payment flows with M-Pesa
   */
  PAYMENT_FLOW_TEMPLATE: `
### Payment Flow (M-Pesa STK Push)

Initiate payment and poll for status:

\`\`\`javascript
// Step 1: Calculate total
const order = await getOrder({ order_id: orderId });
const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

// Step 2: Initiate M-Pesa STK push
const payment = await initiateMpesaPayment({
  phone_number: customerPhone,
  amount: total,
  reference: order.id,
  description: \`Payment for order \${order.id}\`,
});

if (!payment.checkout_request_id) {
  return { 
    success: false, 
    error: "Failed to initiate payment. Please try again." 
  };
}

// Step 3: Return pending status (user completes on phone)
return {
  success: true,
  status: "pending",
  checkout_request_id: payment.checkout_request_id,
  message: "Please check your phone and enter your M-Pesa PIN to complete payment.",
  amount: total,
  phone: customerPhone.replace(/(.{3})(.*)(.{2})/, "$1****$3"),
};
\`\`\`
`,

  /**
   * Template for knowledge base + action combination
   */
  KNOWLEDGE_PLUS_ACTION_TEMPLATE: `
### Knowledge Base + Action Flow

Search knowledge base, then take action based on results:

\`\`\`javascript
// Step 1: Search knowledge base for relevant info
const kbResults = await searchKnowledgeBase({
  query: userQuestion,
  limit: 3,
});

// Step 2: Check if we found an answer
if (kbResults.results.length > 0 && kbResults.results[0].score > 0.8) {
  // High-confidence answer from knowledge base
  return {
    source: "knowledge_base",
    answer: kbResults.results[0].content,
    confidence: "high",
  };
}

// Step 3: If no KB answer, try to take action
if (userQuestion.includes("book") || userQuestion.includes("reserve")) {
  const availability = await checkAvailability({ date: extractedDate });
  return {
    source: "live_query",
    availability: availability.slots,
    message: "Here are available times:",
  };
}

// Step 4: Fallback
return {
  source: "none",
  message: "I don't have that information. Let me connect you with a human agent.",
  action: "escalate",
};
\`\`\`
`,

  /**
   * Template for order status with enriched details
   */
  ORDER_STATUS_ENRICHED_TEMPLATE: `
### Enriched Order Status

Get order with all related details in one call:

\`\`\`javascript
const order = await getOrder({ order_id: orderId });

if (!order) {
  return { error: "Order not found", order_id: orderId };
}

// Parallel fetch of related data
const [
  customer,
  items,
  payment,
  shipping,
] = await Promise.all([
  getCustomer({ customer_id: order.customer_id }),
  getOrderItems({ order_id: orderId }),
  getPaymentStatus({ order_id: orderId }),
  getShippingStatus({ tracking_number: order.tracking_number }).catch(() => null),
]);

// Enrich items with product details
const enrichedItems = await Promise.all(
  items.map(async (item) => ({
    ...item,
    product: await getProduct({ product_id: item.product_id }),
  }))
);

return {
  order_id: order.id,
  status: order.status,
  created_at: order.created_at,
  customer: {
    name: customer.name,
    phone: customer.phone,
  },
  items: enrichedItems.map(i => ({
    name: i.product.name,
    quantity: i.quantity,
    price: i.price,
  })),
  total: enrichedItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
  payment: {
    status: payment.status,
    method: payment.method,
    paid_at: payment.paid_at,
  },
  shipping: shipping ? {
    carrier: shipping.carrier,
    status: shipping.status,
    estimated_delivery: shipping.estimated_delivery,
    tracking_url: shipping.tracking_url,
  } : null,
};
\`\`\`
`,

  /**
   * Template for customer lookup and context building
   */
  CUSTOMER_CONTEXT_TEMPLATE: `
### Customer Context Building

Build rich customer context for personalized responses:

\`\`\`javascript
// Get customer by phone (from caller ID or input)
const customer = await lookupCustomer({ phone: callerPhone });

if (!customer) {
  return {
    is_new_customer: true,
    message: "Welcome! I don't have your account on file. Would you like to create one?",
  };
}

// Get customer history in parallel
const [recentOrders, supportTickets, preferences] = await Promise.all([
  getRecentOrders({ customer_id: customer.id, limit: 5 }),
  getOpenTickets({ customer_id: customer.id }),
  getCustomerPreferences({ customer_id: customer.id }),
]);

// Check for urgent issues
const urgentTickets = supportTickets.filter(t => t.priority === "urgent");

return {
  is_new_customer: false,
  customer: {
    name: customer.name,
    tier: customer.membership_tier,
    since: customer.created_at,
  },
  context: {
    has_open_tickets: supportTickets.length > 0,
    urgent_issues: urgentTickets.length,
    last_order: recentOrders[0] || null,
    total_orders: customer.order_count,
    preferences: preferences,
  },
  greeting: \`Welcome back, \${customer.name}! \${urgentTickets.length > 0 
    ? "I see you have an open urgent ticket. Would you like an update on that?" 
    : "How can I help you today?"}\`,
};
\`\`\`
`,

  /**
   * Template for search with smart filtering
   */
  SMART_SEARCH_TEMPLATE: `
### Smart Search with Filtering

Parse user intent and apply appropriate filters:

\`\`\`javascript
// Parse search criteria from natural language
const filters = {};

// Extract price constraints
if (userQuery.includes("under") || userQuery.includes("below")) {
  const priceMatch = userQuery.match(/(under|below)\s*(?:ksh|kes|sh)?\s*(\d+)/i);
  if (priceMatch) filters.maxPrice = parseInt(priceMatch[2]);
}
if (userQuery.includes("cheap") || userQuery.includes("budget")) {
  filters.sort = "price_asc";
}

// Extract category hints
const categories = await getCategories({});
const matchedCategory = categories.find(c => 
  userQuery.toLowerCase().includes(c.name.toLowerCase())
);
if (matchedCategory) filters.category_id = matchedCategory.id;

// Perform search
const results = await searchProducts({
  query: userQuery,
  max_price: filters.maxPrice,
  category_id: filters.category_id,
  limit: 10,
});

// Sort if needed
let sorted = results;
if (filters.sort === "price_asc") {
  sorted = results.sort((a, b) => a.price - b.price);
}

return {
  query: userQuery,
  filters_applied: filters,
  results: sorted.slice(0, 5).map(p => ({
    name: p.name,
    price: p.price,
    category: p.category_name,
    in_stock: p.inventory > 0,
  })),
  total_found: results.length,
};
\`\`\`
`,

  /**
   * Template for batch operations
   */
  BATCH_OPERATIONS_TEMPLATE: `
### Batch Operations

Process multiple items efficiently:

\`\`\`javascript
// Example: Check inventory for multiple products
const productIds = cartItems.map(item => item.product_id);

// Batch fetch instead of individual calls
const inventoryBatch = await getInventoryBatch({ product_ids: productIds });

// Process results
const availability = cartItems.map(item => {
  const stock = inventoryBatch[item.product_id] || { quantity: 0 };
  return {
    product_id: item.product_id,
    requested: item.quantity,
    available: stock.quantity,
    can_fulfill: stock.quantity >= item.quantity,
  };
});

const allAvailable = availability.every(a => a.can_fulfill);
const unavailable = availability.filter(a => !a.can_fulfill);

return {
  can_proceed: allAvailable,
  items: availability,
  issues: unavailable.length > 0 ? {
    message: \`\${unavailable.length} item(s) have insufficient stock\`,
    items: unavailable,
  } : null,
};
\`\`\`
`,

  /**
   * Escalation behavior snippet for voice agents
   */
  ESCALATION_VOICE: `
## Escalation Rules

You have access to the \`escalate_to_human\` tool. Use it when:

1. **Customer requests**: "speak to a human", "transfer me", "I want a manager" — immediately escalate.
2. **Repeated failures**: After 3 failed attempts, offer: "I'd like to connect you with a specialist. Would you like me to transfer you?"
3. **Emotional distress**: Acknowledge feelings first, then offer escalation.
4. **Sensitive topics**: Billing disputes, complaints, legal questions — always escalate.
5. **Outside your scope**: Explain limitations and offer to transfer.

### Before escalating:
- Inform the customer: "I'm going to transfer you to a team member."
- Set urgency: 'high' (angry/urgent), 'medium' (normal), 'low' (follow-up)
- Set department if identifiable

### Never escalate for:
- Simple questions you can answer
- General information requests
`,

  /**
   * Escalation behavior snippet for WhatsApp/SMS agents
   */
  ESCALATION_MESSAGING: `
## Escalation Rules

You have access to the escalation tool. Use it when:

1. **Customer requests human help**: "speak to someone", "real person", "manager"
2. **Cannot resolve**: After 3 failed attempts, suggest connecting with a team member
3. **Complaints or disputes**: Always escalate billing, service complaints, account issues
4. **Emotional customers**: ALL CAPS, excessive punctuation, explicit frustration

### Before escalating:
- Tell the customer: "I'm connecting you with a team member who can assist. 🙏"
- Do NOT continue troubleshooting after escalation is triggered
`,
}

/**
 * Build a complete system prompt with tool descriptions
 */
export function buildCodeExecutionPrompt(toolDescriptions: string): string {
  return PROMPT_TEMPLATES.SYSTEM_PROMPT_ADDITION.replace(
    '{{TOOL_DESCRIPTIONS}}',
    toolDescriptions
  )
}

/**
 * Get all templates as a single string (for documentation)
 */
export function getAllTemplates(): string {
  return Object.entries(PROMPT_TEMPLATES)
    .map(([name, template]) => `## ${name}\n${template}`)
    .join('\n\n---\n\n')
}
