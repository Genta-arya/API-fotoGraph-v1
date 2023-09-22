const express = require("express");
const db = require("./Koneksi");
const bodyParser = require("body-parser");
const app = express();
const port = 3005;
const cors = require("cors");

const multer = require("multer");
const path = require("path");
app.use(cors());
app.use(bodyParser.json());


const cron = require("node-cron");

const midtransClient = require("midtrans-client");

cron.schedule("*/15 * * * *", async () => {
  try {
    const currentTime = new Date();
    const timeThreshold = new Date(currentTime - 45 * 60 * 1000);

    
    await db.query("DELETE FROM orders WHERE date < ? AND time < ?", [
      timeThreshold.toISOString().split("T")[0],
      timeThreshold.toISOString().split("T")[1],
    ]);

    console.log("Penghapusan pesanan otomatis berhasil.");
  } catch (error) {
    console.error("Terjadi kesalahan saat menghapus pesanan:", error);
  }
});



app.get("/orders", (req, res) => {
  const getUsersQuery = "SELECT * FROM orders";
  db.query(getUsersQuery, (error, results) => {
    if (error) {
      console.error(error);
      res.sendStatus(500);
    } else {
      res.status(200).json(results);
    }
  });
});

app.post("/order", async (req, res) => {
  const {
    id_product,
    nm_product,
    price,
    name,
    contact,
    address,
    email,
    date,
    time,
  } = req.body;

  if (
    !id_product ||
    !nm_product ||
    !price ||
    !name ||
    !contact ||
    !address ||
    !email ||
    !date ||
    !time
  ) {
    console.log("Please fill in all fields");
    return res.status(400).json({ error: "Please fill in all fields" });
  }

  const requestedOrderTime = new Date(`${date}T${time}`).getTime();

  const findPreviousOrderQuery =
    "SELECT MAX(CONCAT(date, ' ', time)) AS maxDateTime FROM orders WHERE date = ?";
  const values = [date];

  db.query(findPreviousOrderQuery, values, async (error, results) => {
    if (error) {
      console.error("Error searching for previous order:", error);
      return res
        .status(500)
        .json({ error: "Error searching for previous order" });
    }

    const maxDateTime = results[0].maxDateTime;

    if (maxDateTime) {
      const previousOrderTime = new Date(maxDateTime).getTime();
      const timeDifferenceMillis = requestedOrderTime - previousOrderTime;
      const minimumTimeDifferenceMillis = 45 * 60 * 1000;

      if (timeDifferenceMillis <= minimumTimeDifferenceMillis) {
        console.log("Waktu pemesanan tidak diizinkan");
        return res
          .status(400)
          .json({ error: "Waktu pemesanan tidak diizinkan" });
      }
    }
    const deletePreviousOrderQuery =
      "DELETE FROM orders WHERE CONCAT(date, ' ', time) < ? AND date = ?";
    const deleteValues = [new Date().toISOString(), date];

    db.query(
      deletePreviousOrderQuery,
      deleteValues,
      (deleteError, deleteResults) => {
        if (deleteError) {
          console.error("Error deleting previous orders:", deleteError);
        }
        console.log("Previous orders deleted:", deleteResults);
      }
    );

    const snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: "SB-Mid-server-BGYfA4SBqkbbDqAgycBbBqIB",
      clientKey: "SB-Mid-client-LAESY4DvSHanXr5C",
    });

    const transactionDetails = {
      order_id: `ORDER_${Math.round(Math.random() * 100000)}`,
      gross_amount: price,
      email: email,
    };

    const enabledPayments = ["credit_card", "cimb_clicks", "bca_klikbca"];

    const creditCardOptions = {
      save_card: false,
      secure: false,
    };

    const transaction = {
      transaction_details: transactionDetails,
      enabled_payments: enabledPayments,
      credit_card: creditCardOptions,
    };

    try {
      const transactionToken = await snap.createTransaction(transaction);
      const paymentToken = transactionToken.token;
      console.log("Payment token:", paymentToken);

      const paymentData = {
        payment_type: "gopay",
        transaction_details: transactionDetails,
        customer_details: {
          email: email,
        },
      };

      const paymentResponse = await snap.createTransaction(paymentData);
      const redirectUrl = paymentResponse.redirect_url;

      const insertOrderQuery =
        "INSERT INTO orders (order_id, id_product, nm_product, price, name, contact, addres, email, date, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const values = [
        transactionDetails.order_id,
        id_product,
        nm_product,
        price,
        name,
        contact,
        address,
        email,
        date,
        time,
      ];

      db.query(insertOrderQuery, values, (error, results) => {
        if (error) {
          console.error("Error placing order:", error);

          return res.status(500).json({ error: "Error placing order" });
        }
        console.log("Order placed successfully:", results);

        res.status(200).json({ redirectUrl });
      });
    } catch (error) {
      console.error("Failed to create transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
    lastOrderTime = requestedOrderTime;
  });
});

app.listen(port,() => {
  console.log(`Server berjalan `);
});
