import os
import pty
import time
import select

DATA_SIZE = 1 * 1024 * 1024  # 1 MB
CHUNK_TO_WRITE = b"A" * 4096

def benchmark(buffer_size, simulate_app_sleep=True):
    master_fd, slave_fd = pty.openpty()

    pid = os.fork()

    if pid == 0:
        # Child
        os.close(master_fd)
        written = 0
        try:
            while written < DATA_SIZE:
                n = os.write(slave_fd, CHUNK_TO_WRITE)
                written += n
        except OSError:
            pass
        os.close(slave_fd)
        os._exit(0)
    else:
        # Parent
        os.close(slave_fd)
        start_time = time.time()
        total_read = 0

        while True:
            r, _, _ = select.select([master_fd], [], [], 0.05) # timeout matches app.py
            if master_fd in r:
                try:
                    data = os.read(master_fd, buffer_size)
                    if not data:
                        break
                    total_read += len(data)
                    # Simulate processing overhead
                    _ = data.decode('utf-8', errors='replace')
                except OSError:
                    break

            if simulate_app_sleep:
                time.sleep(0.01) # app.py sleeps 0.01s per loop iteration

        end_time = time.time()
        os.waitpid(pid, 0)
        os.close(master_fd)

        duration = end_time - start_time
        throughput = total_read / duration / 1024 / 1024
        print(f"Buffer: {buffer_size}, Time: {duration:.4f}s, Throughput: {throughput:.2f} MB/s")

print("Benchmarking read loop performance (simulating app.py behavior with sleep):")
print("Baseline (1024 bytes):")
benchmark(1024, simulate_app_sleep=True)
print("\nOptimized (8192 bytes):")
benchmark(8192, simulate_app_sleep=True)
