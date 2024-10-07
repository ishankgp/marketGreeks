Objective:

You are receiving real-time data for Call and Put greeks (Vega, Theta, etc.) via a WebSocket feed at frequent intervals. Your goal is to create a dynamic table that indicates whether options (Calls and Puts) are being cumulatively bought or sold based on changes in Vega and Theta.
Thesis:

    Buying activity: If Calls or Puts are being bought, the Vega across strikes should increase.
    Selling activity: If Calls or Puts are being sold, Vega and Theta across strikes should decrease.

Data Handling:

    The table should dynamically update as new data comes in.
    If no data is available at 9:15 AM (market open time), consider the default values (at 9:15 AM) as zero.
    For now, only Vega and Theta are of interest.
    The incoming data will provide the current spot price, which should be used to classify strikes as OTM (Out of The Money), ITM (In The Money), and ATM (At The Money). This classification should be updated dynamically as the spot price changes.

Calculation Logic for Table Creation:

    For Calls:
        Compute: (Current Call Greek Values at Time t) - (Call Greek Values at 9:15 AM) for strikes ranging from ATM to OTM.
        Sum the differences for all strikes ATM to OTM.
        Display the results in the following columns:
            Instrument: Nifty (symbol: 256265)
            Vega: Cumulative difference
            Theta: Cumulative difference

    For Puts:
        Perform the same calculation as for Calls but apply it to Puts from ATM to OTM strikes.

    Table Structure:
        Columns:
            Instrument (e.g., Nifty with symbol 256265)
            Vega
            Theta
        The data under Vega and Theta will dynamically reflect the cumulative changes in greek values.

Expansion:

    Once the table is built for Nifty, extend it to handle other indices.
    The code should also handle summing values across different expiry dates as more instruments are added.

Suggestions and Considerations:

    WebSocket handling: Ensure that the WebSocket connection is robust and can handle real-time updates with minimal latency.
    Initial 9:15 AM values: If data is not available at 9:15 AM, handle this scenario gracefully by initializing all values to zero.
    Spot Price Changes: Have a clear and efficient logic to classify strikes as OTM, ITM, and ATM based on spot price updates.
    Dynamic Table Updates: Ensure the table updates efficiently with each WebSocket message without causing performance bottlenecks.
    Multiple Expiries: Once Nifty is working, ensure that the logic for summing across multiple expiries is handled cleanly without overcomplicating the code.