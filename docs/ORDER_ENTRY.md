# Quick order entry

Enter the phone and customer name, then type the song once. A unique returning customer can fill the contact fields when leaving the phone field; customer-match buttons also allow explicit selection. Shared phone numbers require choosing the correct existing profile.

Song entry also searches the live inventory. Selecting an existing song chooses the ready-made service and its catalog price. New songs use Audio or Custom video; the video price follows the selected language. Orders default to the current operator, and the Create order button displays the final catalog amount.

Optional details contains place, age, due date, WhatsApp, assignment, and order notes. Place and age are stored with the customer and shown in customer/order details. Blank optional details on later orders preserve saved values. The customer editor can update or clear them. Age accepts whole years from 0 to 120; place allows 120 characters.

Migration `20261023130000_optional_customer_details.sql` must be applied before this frontend release. It adds nullable columns and a transactional `create_order_with_customer_details` RPC while retaining the original RPC for older app versions and copilot actions. No payment is recorded by creating an order. The form retains entered data if a save fails. Non-Indian country codes are preserved rather than trimming every number to ten digits.
