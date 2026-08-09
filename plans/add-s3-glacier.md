### TODO

Add support for S3 Glacier

- Instant Retrieval: Provides millisecond access for rarely accessed data that still requires immediate retrieval.

As workflow goes:

1. push stuff in S3
2. Consume data to run workflow constructing actual data in paraller
3. use generated data from raw-format as actual data
4. keep the raw for format for re-evaluate
   4.1 Add lifecycle Policies
   4.1.a since it's most likely rarely ever needed after first burst, we can backup them with Glacier
   4.1.b Or just delete after while?
