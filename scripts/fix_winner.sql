-- Check if Abdallah has any bids on the auctions where he's now winner
SELECT b.id, b."userId", b."auctionId", b.amount, a.title, a."winnerId"
FROM "Bid" b
JOIN "Auction" a ON a.id = b."auctionId"
WHERE b."userId" = '01d759ec-2a4e-4736-8e22-4e925b27ceb9'
  AND a.status = 'ENDED';
