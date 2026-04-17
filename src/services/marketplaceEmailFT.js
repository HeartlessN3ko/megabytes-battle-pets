// Marketplace Order Flavor Text Email Generator
// Generates email subject and body based on order status

const ORDER_CONFIRMED = [
  'Your order is confirmed. The system promises this was intentional.',
  'Order received. We are pretending everything is under control.',
  'Your package exists now. That\'s already a good start.',
  'Order confirmed. No one knows why you bought this, but we support you.',
  'Your item has been located. That was the first challenge.',
];

const PROCESSING = [
  'Your package is being prepared for shipment.',
  'Item secured. Packaging protocols in progress.',
  'Your order is currently being assembled.',
  'Packaging complete. Awaiting dispatch window.',
  'Your item is moving through sorting systems.',
];

const PROCESSING_RARE = [
  'Your package is being carefully handled by something.',
  'Packaging complete. Confidence levels unclear.',
  'Your item was briefly lost, then found again. Everything is fine.',
  'Your package has been inspected and judged. It passed.',
  'Your item is being packed with suspicious enthusiasm.',
];

const SHIPPED = [
  'Your package has left the facility and is in transit.',
  'Shipment confirmed. Your item is on the move.',
  'Your order is traveling through the network.',
  'Package dispatched. Tracking is now active.',
  'Your item is en route to your location.',
];

const SHIPPED_RARE = [
  'Your package is moving. We are choosing not to interfere.',
  'Shipment confirmed. It\'s out there now.',
  'Your package has entered the wild.',
  'Your item is traveling faster than expected. We are monitoring this.',
  'Your package is in transit. It refuses to elaborate further.',
];

const OUT_FOR_DELIVERY = [
  'Your package is out for delivery. Arrival imminent.',
  'Delivery agent has your package. Expect it soon.',
  'Your item is approaching your location.',
  'Final delivery phase initiated.',
  'Your package is in the last stage of transit.',
];

const OUT_FOR_DELIVERY_RARE = [
  'Your package is nearby. It can probably see you.',
  'Delivery agent is en route. Morale unknown.',
  'Your package is very close. Maybe too close.',
  'Your item is out for delivery and making bold decisions.',
  'Delivery is imminent. Brace accordingly.',
];

const DELIVERED = [
  'Your package has been delivered successfully.',
  'Delivery confirmed. Your item is now available.',
  'Your package has arrived at your location.',
  'Shipment complete. Enjoy your item.',
  'Your order has been delivered and logged.',
];

const DELIVERED_RARE = [
  'Your package has arrived. It looks exactly like you expected. Probably.',
  'Delivery complete. The box is judging you slightly.',
  'Your item has arrived safely. No further questions.',
  'Package delivered. Opening it is your problem now.',
  'Your package has arrived and is ready to be perceived.',
];

const DELAYED = [
  'Your package has been delayed in transit.',
  'Delivery is taking longer than expected.',
  'Shipment delay detected. New ETA pending.',
  'Your item encountered a routing issue.',
  'Delivery timeline has been extended.',
];

const DELAYED_RARE = [
  'Your package took a detour. It had reasons.',
  'Delivery delayed. The system is thinking about it.',
  'Your package is lost in a very temporary way.',
  'Delay confirmed. Everyone is acting calm about it.',
  'Your item is experiencing character development.',
];

const ISSUE = [
  'Your package encountered an issue during transit.',
  'Shipment status unclear. Investigation in progress.',
  'Your item is currently unaccounted for.',
  'Delivery failed. Retrying process.',
  'Your package has been flagged for recovery.',
];

const ISSUE_RARE = [
  'Your package fell off the truck. Agents have been dispatched.',
  'Your item is missing, but not gone. Probably.',
  'We misplaced your package. We are being honest about it.',
  'Your package is somewhere unexpected. We are narrowing it down.',
  'Recovery teams are searching for your item with mixed confidence.',
];

const RECOVERED = [
  'Your package has been recovered and is back in transit.',
  'Issue resolved. Delivery attempt restarting.',
  'Your item has been located and reprocessed.',
  'Shipment restored. Continuing delivery.',
  'Recovery successful. New ETA available.',
];

const RECOVERED_RARE = [
  'Your package has been found. It refuses to explain where it was.',
  'Recovery complete. The item seems… different, but usable.',
  'Your package has returned from its journey.',
  'We found your item. It was being weird about it.',
  'Your package is back. Let\'s not talk about what happened.',
];

const DELIVERY_FAILED = [
  'Delivery attempt failed. Retrying shortly.',
  'Unable to complete delivery. New attempt scheduled.',
  'Delivery unsuccessful. Adjusting route.',
  'Your package could not be delivered at this time.',
  'Another attempt will be made soon.',
];

const DELIVERY_FAILED_RARE = [
  'Delivery failed. Your package did not vibe with the location.',
  'Your item refused delivery. We are negotiating.',
  'Attempt failed. The package is being dramatic.',
  'Delivery unsuccessful. The situation escalated slightly.',
  'Your package is reconsidering its life choices.',
];

function pick(list) {
  if (!Array.isArray(list) || list.length === 0) return 'Order status update.';
  return list[Math.floor(Math.random() * list.length)];
}

function shouldUseRare() {
  return Math.random() < 0.15; // 15% chance of rare variant
}

function getStatusPools(status) {
  const isRare = shouldUseRare();

  const pools = {
    order_confirmed: isRare ? ORDER_CONFIRMED : ORDER_CONFIRMED,
    processing: isRare ? PROCESSING_RARE : PROCESSING,
    shipped: isRare ? SHIPPED_RARE : SHIPPED,
    out_for_delivery: isRare ? OUT_FOR_DELIVERY_RARE : OUT_FOR_DELIVERY,
    delivered: isRare ? DELIVERED_RARE : DELIVERED,
    delayed: isRare ? DELAYED_RARE : DELAYED,
    issue: isRare ? ISSUE_RARE : ISSUE,
    recovered: isRare ? RECOVERED_RARE : RECOVERED,
    delivery_failed: isRare ? DELIVERY_FAILED_RARE : DELIVERY_FAILED,
  };

  return pools[status] || ORDER_CONFIRMED;
}

function getSubject(status) {
  const subjects = {
    order_confirmed: 'Order Confirmed',
    processing: 'Processing Your Order',
    shipped: 'Your Order Has Shipped',
    out_for_delivery: 'Out For Delivery',
    delivered: 'Delivery Complete',
    delayed: 'Delivery Delayed',
    issue: 'Delivery Issue',
    recovered: 'Order Recovered',
    delivery_failed: 'Delivery Reattempt',
  };

  return subjects[status] || 'Order Update';
}

function generateMarketplaceEmail(status, itemName = null) {
  const subject = getSubject(status);
  const pool = getStatusPools(status);
  const body = pick(pool);

  return {
    subject,
    body,
    kind: 'marketplace',
  };
}

module.exports = { generateMarketplaceEmail };
